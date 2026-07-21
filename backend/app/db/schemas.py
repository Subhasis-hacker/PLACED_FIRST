from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserBase(BaseModel):
    username: str = Field(..., min_length=2, max_length=100)
    email: EmailStr


class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=128)


class UserResponse(UserBase):
    id: int
    is_active: bool

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