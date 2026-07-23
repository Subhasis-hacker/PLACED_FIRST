import logging
from datetime import timedelta
from typing import List
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.db import schemas
from app.db.db import Base, engine, get_db
import json
import json
from app.db.schemas import (
    MedicalChatRequest,
    MedicalChatResponse,
    Token,
    UploadReportResponse,
    UserCreate,
    UserResponse,
)
from app.models import UserModel, MedicalReport,ChatHistory,Doctor, BookingStatus,Patient,Booking
from app.services.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    authenticate_user,
    create_access_token,
    get_current_active_user,
    get_password_hash,
)
from app.services import doctor_auth

from app.services.ingest import analyze_pdf
from app.services.mediadv import generate_medical_chat_reply

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="medi-friend",
    description="AI Medical Report Assistant with patient authentication, temporary RAG analysis, and chat.",
    version="1.0.0",
)

# Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning("Invalid request for %s: %s", request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.post("/register", response_model=UserResponse)
def register_user(user_in: UserCreate, db: Session = Depends(get_db)):
    normalized_email = user_in.email.lower().strip()
    normalized_username = user_in.username.strip()

    if db.query(UserModel).filter(UserModel.username == normalized_username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already registered")
    if db.query(UserModel).filter(UserModel.email == normalized_email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    new_user = UserModel(
        username=normalized_username,
        email=normalized_email,
        hashed_password=get_password_hash(user_in.password),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": user.username}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/users/me/", response_model=UserResponse)
async def read_users_me(current_user: UserModel = Depends(get_current_active_user)):
    return current_user


@app.post("/upload", response_model=UploadReportResponse)
async def upload_report(
    file: UploadFile = File(...),
    language: str = Form("English"),
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    session_id, report, preview = await analyze_pdf(file, language)
    
    # Save to db
    db_report = MedicalReport(
        user_id=current_user.id,
        session_id=session_id,
        original_text=preview,
        structured_data=json.dumps(report.model_dump())
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)

    return {
        "status": "success",
        "language": language,
        "session_id": session_id,
        "report_id": db_report.id,
        "report": report,
        "raw_text_preview": preview,
    }
    
    
@app.post("/chat", response_model=MedicalChatResponse)
async def chat_endpoint(
    payload: MedicalChatRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    reply = await generate_medical_chat_reply(payload=payload, current_user=current_user, db=db)
    return {"reply": reply}




app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Doctor Authentication Routes ---
@app.post("/api/doctor/register", response_model=schemas.DoctorCardResponse, status_code=status.HTTP_201_CREATED)
def register_doctor(doctor_in: schemas.DoctorRegister, db: Session = Depends(get_db)):
    existing = db.query(Doctor).filter(Doctor.email == doctor_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Doctor with this email already exists.")
    doc = doctor_auth.create_doctor(db, doctor_in)
    return schemas.DoctorCardResponse(
        id=doc.id, name=doc.name, specialty=doc.specialty, city=doc.city, phone=doc.phone, average_rating=0.0
    )

@app.post("/api/doctor/login")
def login_doctor(credentials: schemas.DoctorLogin, db: Session = Depends(get_db)):
    doc = doctor_auth.authenticate_doctor(db, credentials.email, credentials.password)
    if not doc:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"message": "Login successful", "doctor_id": doc.id, "name": doc.name}

# --- Patient Search & Sorting Route ---
@app.get("/api/doctors/search", response_model=List[schemas.DoctorCardResponse])
def search_doctors(specialty: str, city: str, db: Session = Depends(get_db)):
    """Search doctors by department & city sorted descending by rating."""
    return doctor_auth.search_doctors_by_specialty_and_city(db, specialty=specialty, city=city)

# --- Slot Booking & Sequential Token Route ---
@app.post("/api/bookings/create", response_model=schemas.BookingResponse)
def book_appointment(booking_in: schemas.BookingCreate, db: Session = Depends(get_db)):
    return doctor_auth.create_booking_with_token(db, booking_in)

# --- Doctor Dashboard Routes ---
@app.get("/api/doctor/{doctor_id}/analytics", response_model=schemas.DoctorAnalytics)
def doctor_analytics(doctor_id: int, db: Session = Depends(get_db)):
    analytics = doctor_auth.get_doctor_analytics(db, doctor_id)
    if not analytics:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return analytics

@app.get("/api/doctor/{doctor_id}/queue", response_model=List[schemas.PatientInQueue])
def todays_queue(doctor_id: int, db: Session = Depends(get_db)):
    return doctor_auth.get_todays_active_queue(db, doctor_id)

# --- Lifecycle Cleanup / Cron Route ---
@app.post("/api/cron/archive-bookings")
def trigger_data_archiving(db: Session = Depends(get_db)):
    """Triggers soft-deletion/archiving of expired or rated bookings."""
    result = doctor_auth.archive_expired_or_rated_bookings(db)
    return {"status": "success", "archived_stats": result}