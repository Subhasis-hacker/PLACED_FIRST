from pydantic import BaseModel, EmailStr,Field
from typing import Optional,Literal,List,Dict

class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    is_active: bool

    class Config:
        from_attributes = True  # Allows Pydantic to read SQLAlchemy models

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str | None = None
    
    
class DemographicsExtractor(BaseModel):
    age: Optional[int] = Field(None, description="Age in years")
    gender: Optional[str] = Field(None, description="Biological sex")
    weight: Optional[str] = Field(None, description="Weight with units if provided")
    height: Optional[str] = Field(None, description="Height with units if provided")
    previous_diseases: Optional[str] = Field(None, description="Any pre-existing conditions, chronic illnesses, or past surgeries mentioned by the user.")
    all_collected: bool = Field(..., description="True only if age, gender, weight, height, AND previous diseases are successfully extracted.")

class MedicalReport(BaseModel):
    triage_urgency: Literal["EMERGENCY", "SCHEDULE_DOCTOR", "SELF_CARE"]
    probable_conditions: List[Dict[str, str]] = Field(..., description="Keys: condition_name, likelihood, explanation")
    recommended_tests: List[Dict[str, str]] = Field(..., description="Keys: test_name, purpose")
    precautions: List[str]

class ChatPayload(BaseModel):
    current_stage: Literal["DEMOGRAPHICS", "INTAKE", "FOLLOW_UP", "FINAL"] = "DEMOGRAPHICS"
    language: str = "English"  # ◄--- ADD THIS FIELD HERE
    demographics: Dict[str, Optional[str]] = {
        "age": None, 
        "gender": None, 
        "weight": None, 
        "height": None,
        "previous_diseases": None
    }
    raw_symptoms: str = ""
    follow_up_count: int = 0
    chat_history: List[Dict[str, str]] = []
    final_output: Optional[Dict] = None