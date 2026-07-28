from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from datetime import date
import hashlib
from app import models
from app.db import schemas
from app.db.db import get_db
from app.models import Doctor
from app.services.auth import get_password_hash

# def hash_password(password: str) -> str:
#     return hashlib.sha256(password.encode()).hexdigest()

# 1. Doctor Registration & Authentication
def create_doctor(db: Session, doctor_in: schemas.DoctorRegister):
    hashed_pwd = get_password_hash(doctor_in.password)
    db_doctor = models.Doctor(
        name=doctor_in.name,
        email=doctor_in.email,
        hashed_password=hashed_pwd,
        phone=doctor_in.phone,
        city=doctor_in.city.lower(),  # Store lowercase for case-insensitive matching
        specialty=doctor_in.specialty
    )
    db.add(db_doctor)
    db.commit()
    db.refresh(db_doctor)
    return db_doctor

def authenticate_doctor(db: Session, email: str, password: str):
    hashed_password = get_password_hash(password)
    return db.query(models.Doctor).filter(
        models.Doctor.email == email,
        models.Doctor.hashed_password == hashed_password
    ).first()

# 2. Patient Search & Sorting Query
def search_doctors_by_specialty_and_city(db: Session, specialty: str, city: str):
    """
    Case-insensitive search for doctors by specialty and city, 
    sorted by highest rating first.
    """
    return db.query(Doctor).filter(
        Doctor.specialty.ilike(f"%{specialty}%"),
        Doctor.city.ilike(f"%{city}%")
    ).order_by(Doctor.average_rating.desc()).all()

    return [
        schemas.DoctorCardResponse(
            id=r.id,
            name=r.name,
            specialty=r.specialty,
            city=r.city.title(),
            phone=r.phone,
            average_rating=round(float(r.average_rating), 1)
        )
        for r in results
    ]

# 3. Race-Condition Safe Sequential Token Generation
def create_booking_with_token(db: Session, booking_in: schemas.BookingCreate):
    """
    Uses PostgreSQL row locking (with_for_update) on existing daily records
    to ensure sequential, gapless token assignment per doctor per day.
    Token numbers reset to 1 every new date.
    """
    # Acquire locking context for this specific doctor and day
    existing_max_token = (
        db.query(func.max(models.Booking.token_number))
        .filter(
            models.Booking.doctor_id == booking_in.doctor_id,
            models.Booking.booking_date == booking_in.booking_date
        )
        .with_for_update() # Locks rows until transaction completes
        .scalar()
    )

    next_token = (existing_max_token or 0) + 1

    new_booking = models.Booking(
        doctor_id=booking_in.doctor_id,
        patient_id=booking_in.patient_id,
        booking_date=booking_in.booking_date,
        time_slot=booking_in.time_slot,
        token_number=next_token,
        status=models.BookingStatus.ACTIVE
    )
    
    db.add(new_booking)
    db.commit()
    db.refresh(new_booking)
    return new_booking

# 4. Doctor Dashboard Analytics & Queue
def get_doctor_analytics(db: Session, doctor_id: int):
    doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not doctor:
        return None

    total_checked = db.query(models.Booking).filter(
        models.Booking.doctor_id == doctor_id,
        models.Booking.status == models.BookingStatus.COMPLETED
    ).count()

    avg_rating = db.query(func.coalesce(func.avg(models.Rating.stars), 0.0)).filter(
        models.Rating.doctor_id == doctor_id
    ).scalar()

    return schemas.DoctorAnalytics(
        doctor_id=doctor.id,
        name=doctor.name,
        specialty=doctor.specialty,
        city=doctor.city.title(),
        total_patients_checked=total_checked,
        average_rating=round(float(avg_rating), 1)
    )

def get_todays_active_queue(db: Session, doctor_id: int):
    """
    Returns non-archived, active patient bookings scheduled for today.
    """
    today = date.today()
    results = (
        db.query(
            models.Patient.name.label("patient_name"),
            models.Patient.city.label("patient_city"),
            models.Patient.email.label("patient_email"),
            models.Booking.token_number,
            models.Booking.time_slot,
            models.Booking.id.label("booking_id")
        )
        .join(models.Booking, models.Patient.id == models.Booking.patient_id)
        .filter(
            models.Booking.doctor_id == doctor_id,
            models.Booking.booking_date == today,
            models.Booking.status == models.BookingStatus.ACTIVE,
            models.Booking.is_archived == False
        )
        .order_by(models.Booking.token_number.asc())
        .all()
    )
    return results

# 5. Data Lifecycle & Archiving
def archive_expired_or_rated_bookings(db: Session):
    """
    Automated job function: Soft-deletes/archives active queue entries 
    if the appointment date has passed or a rating has been logged.
    """
    today = date.today()
    
    # Condition 1: Passed appointment date
    expired_count = db.query(models.Booking).filter(
        models.Booking.booking_date < today,
        models.Booking.is_archived == False
    ).update({"is_archived": True, "status": models.BookingStatus.ARCHIVED}, synchronize_session=False)

    # Condition 2: Bookings that received ratings
    rated_booking_ids = db.query(models.Rating.booking_id).subquery()
    rated_count = db.query(models.Booking).filter(
        models.Booking.id.in_(rated_booking_ids),
        models.Booking.is_archived == False
    ).update({"is_archived": True, "status": models.BookingStatus.COMPLETED}, synchronize_session=False)

    db.commit()
    return {"expired_archived": expired_count, "rated_archived": rated_count}