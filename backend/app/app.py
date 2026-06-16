import token
from sqlalchemy.orm import Session
from app.db.db import engine, Base, get_db
from app.models import UserModel
from app.db.schemas import UserCreate, UserResponse, Token
from app.services.auth import (authenticate_user, create_access_token, get_current_active_user, get_password_hash,ACCESS_TOKEN_EXPIRE_MINUTES)
from fastapi import Depends, FastAPI, Form, UploadFile, File,HTTPException,status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from app.services.ingest import process_pdf
from datetime import datetime, timedelta




app = FastAPI(title="medi-friend", description="A simple RAG API using FastAPI and LangChain", version="0.1.0")



Base.metadata.create_all(bind=engine)

app = FastAPI()

# 1. Registration endpoint to save users to your cloud DB
@app.post("/register", response_model=UserResponse)
def register_user(user_in: UserCreate, db: Session = Depends(get_db)):
    # 1. Check if the username is already taken
    username_exists = db.query(UserModel).filter(UserModel.username == user_in.username).first()
    if username_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Username already registered"
        )
    
    # 2. Check if the email is already taken (This prevents the UniqueViolation crash)
    email_exists = db.query(UserModel).filter(UserModel.email == user_in.email).first()
    if email_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Email already registered"
        )
    
    # 3. Safe to proceed if both checks pass
    hashed_pwd = get_password_hash(user_in.password)
    new_user = UserModel(
        username=user_in.username,
        email=user_in.email,
        hashed_password=hashed_pwd
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

# 2. Updated Token endpoint using Database session
@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
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

# 3. Secure Protected Endpoints
@app.get("/users/me/", response_model=UserResponse)
async def read_users_me(current_user: UserModel = Depends(get_current_active_user)):
    return current_user

@app.get("/users/me/items")
async def read_item_own(current_user: UserModel = Depends(get_current_active_user)):
    return [{"item_id": 1, "owner": current_user.username}]





#upload endpoint
@app.post("/upload")  # Clean string path, no f-string interpolation
async def upload(file: UploadFile = File(...),language: str = Form("English")):
    content = await file.read()
    rag_response = await process_pdf(content,language)  # Ensure process_pdf is an async function

    # Clean string extraction to bypass FastAPI's Pydantic v1 error
    if hasattr(rag_response, "content"):  # If it's a LangChain AIMessage object
        final_text = rag_response.content
    elif isinstance(rag_response, dict) and "output_text" in rag_response:
        final_text = rag_response["output_text"]
    elif isinstance(rag_response, dict) and "output" in rag_response:
        final_text = rag_response["output"]
    else:
        final_text = str(rag_response)

    return {
        "status": "success",
        "language": language,
        "rag_response": final_text  # Fixed the variable name typo
    }