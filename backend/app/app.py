import logging
from datetime import timedelta

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

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
from app.models import UserModel, MedicalReport
from app.services.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    authenticate_user,
    create_access_token,
    get_current_active_user,
    get_password_hash,
)
from app.services.ingest import analyze_pdf
from app.services.mediadv import generate_medical_chat_reply

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="medi-friend",
    description="AI Medical Report Assistant with patient authentication, temporary RAG analysis, and chat.",
    version="1.0.0",
)

Base.metadata.create_all(bind=engine)

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
