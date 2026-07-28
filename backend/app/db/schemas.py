from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import date, datetime
from typing import Optional, List,Literal
from app.models import BookingStatus




class UserBase(BaseModel):
    username: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    role: str = Field(default="patient")


class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=128)


class UserResponse(UserBase):
    id: int
    is_active: bool
    role: str

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: str | None = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"] = "user"
    content: str = Field(..., min_length=1)


class StructuredMedicalReport(BaseModel):
    medical_summary: str
    precautions: list[str] = Field(default_factory=list)
    primary_treatments: list[str] = Field(default_factory=list)
    when_to_seek_clinical_care: list[str] = Field(default_factory=list)
    medical_disclaimer: str


class UploadReportResponse(BaseModel):
    status: str
    language: str
    session_id: str
    report_id: int
    report: StructuredMedicalReport
    raw_text_preview: str | None = None


class MedicalChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    language: str = "English"
    session_id: str | None = None
    history: list[ChatMessage] = Field(default_factory=list)



class MedicalChatResponse(BaseModel):
    reply: str | None = None
    
    

# --- Doctor Schemas ---
class DoctorRegister(BaseModel):
    name: str = Field(..., min_length=2, example="Dr. Sarah Connor")
    email: EmailStr
    phone: str = Field(..., example="+1234567890")
    city: str = Field(..., example="Rourkela")
    specialty: str = Field(..., example="Cardiology")
    password: str = Field(..., min_length=6)

class DoctorLogin(BaseModel):
    email: EmailStr
    password: str

class DoctorCardResponse(BaseModel):
    id: int
    name: str
    specialty: str
    city: str
    phone: str
    average_rating: float
    
    # FIX: This configuration tells FastAPI how to read the database object
    class Config:
        from_attributes = True  # Use this if you are on Pydantic v2
        orm_mode = True         # Include this as a fallback if you are on Pydantic v1

class DoctorAnalytics(BaseModel):
    doctor_id: int
    name: str
    specialty: str
    city: str
    total_patients_checked: int
    average_rating: float

# --- Booking & Queue Schemas ---
class BookingCreate(BaseModel):
    doctor_id: int
    patient_id: int
    booking_date: date
    time_slot: str

class PatientInQueue(BaseModel):
    patient_name: str
    patient_city: str
    patient_email: str
    token_number: int
    time_slot: str
    booking_id: int

class BookingResponse(BaseModel):
    id: int
    doctor_id: int
    patient_id: int
    booking_date: date
    time_slot: str
    token_number: int
    status: BookingStatus

    class Config:
        from_attributes = True

class RatingCreate(BaseModel):
    booking_id: int
    patient_id: int
    stars: int = Field(..., ge=1, le=5)
    review: Optional[str] = None