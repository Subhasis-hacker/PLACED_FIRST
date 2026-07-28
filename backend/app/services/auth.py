import os
from datetime import datetime, timedelta, timezone

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.db.db import get_db
from app.models import UserModel,Patient
from pydantic import BaseModel, EmailStr, Field, field_validator


load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "medi-friend-local-development-secret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_user_by_identifier(db: Session, identifier: str) -> UserModel | None:
    normalized_identifier = identifier.strip().lower()
    user = db.query(UserModel).filter(UserModel.email == normalized_identifier).first()
    if user is None:
        user = db.query(UserModel).filter(UserModel.username == normalized_identifier).first()
    return user

def authenticate_user(db: Session, username_or_email: str, password: str):
    # Authenticate against the Patient table
    user = db.query(Patient).filter(
        (Patient.username == username_or_email) | (Patient.email == username_or_email)
    ).first()
    
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    # FIX: Query the Patient table instead of UserModel!
    user = db.query(Patient).filter(Patient.email == email).first()
    
    if user is None:
        raise credentials_exception
        
    # Dynamically attach the role so the frontend knows this is a patient
    setattr(user, 'role', 'patient')
    
    return user

async def get_current_active_user(current_user: Patient = Depends(get_current_user)):
    # Check against the is_active column we added earlier
    if not getattr(current_user, "is_active", True):
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

### doctor auth
