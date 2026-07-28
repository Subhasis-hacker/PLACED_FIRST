from datetime import datetime
import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Date, Enum, Float, Text, Index,Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.db import Base


class UserModel(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="patient")
    is_active = Column(Boolean, default=True)


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String(64), nullable=True, index=True)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class MedicalReport(Base):
    __tablename__ = "medical_reports"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # FIX: Change "users.id" to "patients.id"
    user_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE")) 
    
    session_id = Column(String(100))
    original_text = Column(Text)
    structured_data = Column(Text)
    created_at = Column(DateTime, default=func.now())


### doctor

class BookingStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    ARCHIVED = "ARCHIVED"

class Doctor(Base):
    __tablename__ = "doctors"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    specialty = Column(String(100))
    city = Column(String(100))
    phone = Column(String(20))
    average_rating = Column(Integer, default=0)
    
    # Existing booking relationship
    bookings = relationship("Booking", back_populates="doctor", cascade="all, delete-orphan")
    
    # FIX: Add the missing ratings relationship here!
    ratings = relationship("Rating", back_populates="doctor", cascade="all, delete-orphan")
    
    
class Patient(Base):
    __tablename__ = "patients"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    
    # FIX: Add the missing column to the database schema
    is_active = Column(Boolean, default=True)
    
    bookings = relationship("Booking", back_populates="patient", cascade="all, delete-orphan")
    
class Booking(Base):
    __tablename__ = "bookings"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False)
    
    booking_date = Column(Date, nullable=False)
    time_slot = Column(String(20), nullable=False)
    token_number = Column(Integer, nullable=False)
    status = Column(String(20), default="ACTIVE")
    is_archived = Column(Boolean, default=False)
    
    # Existing relationships
    patient = relationship("Patient", back_populates="bookings")
    doctor = relationship("Doctor", back_populates="bookings")
    
    # FIX: Add the missing rating relationship here!
    # (uselist=False means one booking has exactly one rating)
    rating = relationship("Rating", back_populates="booking", uselist=False, cascade="all, delete-orphan")
    
class Rating(Base):
    __tablename__ = "ratings"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), unique=True, nullable=False)
    stars = Column(Integer, nullable=False) # 1 to 5
    review = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    doctor = relationship("Doctor", back_populates="ratings")
    booking = relationship("Booking", back_populates="rating")