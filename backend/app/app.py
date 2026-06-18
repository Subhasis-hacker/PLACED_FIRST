import token
from sqlalchemy.orm import Session
from app.db.db import engine, Base, get_db
from app.models import UserModel
from app.db.schemas import UserCreate, UserResponse, Token,ChatPayload,DemographicsExtractor,MedicalReport,DoctorCreate, DoctorResponse, WorkflowSubmit, PrescriptionApproval,DoctorModel,PrescriptionWorkflow,WorkflowStatusEnum
from app.services.auth import (authenticate_user, create_access_token, get_current_active_user, get_password_hash,ACCESS_TOKEN_EXPIRE_MINUTES,get_doctor_by_email,create_role_access_token,get_current_doctor,authenticate_doctor)
from fastapi import Depends, FastAPI, Form, UploadFile, File,HTTPException,status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from app.services.ingest import process_pdf
from datetime import datetime, timedelta
from app.services.mediadv import orchestrate_chat_flow
from fastapi.middleware.cors import CORSMiddleware
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from fastapi.responses import StreamingResponse
import io
from app.services.prescription_generator import generate_draft_prescription


app = FastAPI(title="medi-friend", description="A simple RAG API using FastAPI and LangChain", version="0.1.0")



Base.metadata.create_all(bind=engine)


app = FastAPI()
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_credentials=True,allow_methods=["*"],allow_headers=["*"],)




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





#3 upload endpoint
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
 
 
 
 
#4  medical adviser endpoint
@app.post("/chat", response_model=ChatPayload)
async def chat_endpoint(payload: ChatPayload):
    """
    Receives the full conversation history payload, validates the input structure,
    and delegates execution execution completely to the medical AI service layer.
    """
    if not payload.chat_history:
        raise HTTPException(status_code=400, detail="Chat history cannot be empty.")
        
    # Execute state transitions and LLM evaluation loops
    updated_payload = orchestrate_chat_flow(payload)
    
    return updated_payload



##5 docotor register endpoint
@app.post("/doctor/register", response_model=DoctorResponse)
def register_doctor(doc_in: DoctorCreate, db: Session = Depends(get_db)):
    if get_doctor_by_email(db, doc_in.email):
        raise HTTPException(status_code=400, detail="Email already registered for a professional practitioner.")
    
    new_doc = DoctorModel(
        name=doc_in.name,
        email=doc_in.email,
        hashed_password=get_password_hash(doc_in.password)
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    return new_doc

###6 doctor login endpoint
@app.post("/doctor/token")
async def login_doctor(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    doctor = authenticate_doctor(db, form_data.username, form_data.password) # form_data.username passes email here
    if not doctor:
        raise HTTPException(status_code=401, detail="Invalid clinician credentials.")
    
    token = create_role_access_token(data={"sub": doctor.email}, role="doctor")
    return {"access_token": token, "token_type": "bearer"}

@app.post("/prescriptions/submit-to-doctor")
async def submit_draft_to_doctor(
    payload: WorkflowSubmit, 
    current_user: UserModel = Depends(get_current_active_user), 
    db: Session = Depends(get_db)
):
    """
    Step 1: Patient submits their raw LLM response summary data block 
    targeted to a specific doctor via their unique email string.
    """
    target_doctor = get_doctor_by_email(db, payload.doctor_email)
    if not target_doctor:
        raise HTTPException(status_code=404, detail="Target practitioner not found in system registers.")

    # Prevent duplicates in the active queue
    active_exists = db.query(PrescriptionWorkflow).filter(
        PrescriptionWorkflow.user_id == current_user.id,
        PrescriptionWorkflow.doctor_id == target_doctor.id,
        PrescriptionWorkflow.status == WorkflowStatusEnum.PENDING
    ).first()
    
    if active_exists:
        raise HTTPException(status_code=400, detail="An active prescription verification request is already pending with this doctor.")

    workflow_entry = PrescriptionWorkflow(
        user_id=current_user.id,
        doctor_id=target_doctor.id,
        ai_generated_draft=payload.ai_response_text,
        status=WorkflowStatusEnum.PENDING
    )
    db.add(workflow_entry)
    db.commit()
    return {"status": "success", "message": "Draft successfully routed to the practitioner queue."}

@app.get("/doctor/queue")
async def get_doctor_active_queue(current_doctor: DoctorModel = Depends(get_current_doctor), db: Session = Depends(get_db)):
    """Step 2: Doctor fetches their active workspace workload."""
    return db.query(PrescriptionWorkflow).filter(
        PrescriptionWorkflow.doctor_id == current_doctor.id,
        PrescriptionWorkflow.status == WorkflowStatusEnum.PENDING
    ).all()
    
@app.post("/doctor/prescription/approve")
async def approve_and_finalize_prescription(
    payload: PrescriptionApproval, 
    current_doctor: DoctorModel = Depends(get_current_doctor), 
    db: Session = Depends(get_db)
):
    """
    Step 3: Doctor modifies the prescription payload data array.
    Instead of a dangerous hard-delete, we set status to APPROVED to remove it from the active queue.
    """
    workflow = db.query(PrescriptionWorkflow).filter(
        PrescriptionWorkflow.id == payload.workflow_id,
        PrescriptionWorkflow.doctor_id == current_doctor.id
    ).first()

    if not workflow:
        raise HTTPException(status_code=404, detail="Target workflow context vector not verified.")

    # Write modifications and switch status to clear the queue
    workflow.final_prescription = payload.doctor_edited_medications
    workflow.status = WorkflowStatusEnum.APPROVED
    db.commit()
    
    return {"status": "success", "message": "Prescription verified and signed off successfully."}

@app.get("/prescriptions/{workflow_id}/download-pdf")
async def download_prescription_pdf(
    workflow_id: int, 
    current_user: UserModel = Depends(get_current_active_user), 
    db: Session = Depends(get_db)
):
    """Step 4: Compiles and returns an immutable PDF for the user."""
    record = db.query(PrescriptionWorkflow).filter(
        PrescriptionWorkflow.id == workflow_id,
        PrescriptionWorkflow.user_id == current_user.id,
        PrescriptionWorkflow.status == WorkflowStatusEnum.APPROVED
    ).first()

    if not record:
        raise HTTPException(status_code=404, detail="Approved prescription artifact unavailable for this context.")

    doctor = db.query(DoctorModel).filter(DoctorModel.id == record.doctor_id).first()

    # Dynamic Memory Stream PDF Assembly via Reportlab
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    story = []
    styles = getSampleStyleSheet()

    story.append(Paragraph(f"<b>FINAL CLINICAL PRESCRIPTION</b>", styles['Heading1']))
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"<b>Patient Identity Ref:</b> {current_user.username}", styles['Normal']))
    story.append(Paragraph(f"<b>Authorized Signatory Practitioner:</b> Dr. {doctor.name} ({doctor.email})", styles['Normal']))
    story.append(Spacer(1, 20))
    
    # Raw Text formatting wrapper conversion
    formatted_meds = record.final_prescription.replace("\n", "<br/>")
    story.append(Paragraph(f"<b>Prescribed Regimen / Directives:</b><br/>{formatted_meds}", styles['BodyText']))

    doc.build(story)
    buffer.seek(0)

    return StreamingResponse(
        buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename=prescription_{workflow_id}.pdf"}
    )
    
    
    
###7. prescription aprovation
@app.post("/prescriptions/generate-and-submit")
async def generate_and_submit_prescription(
    doctor_email: str = Form(...),
    disease_analysis: str = Form(...),
    symptoms: str = Form(...),
    current_user: UserModel = Depends(get_current_active_user), 
    db: Session = Depends(get_db)
):
    """
    Step 1 (Alternative): Takes the disease list and patient symptoms,
    calls the Llama-3.3 model to generate a non-binding draft prescription, 
    and automatically routes it to the designated doctor's active review queue.
    """
    # 1. Look up the designated doctor
    target_doctor = get_doctor_by_email(db, doctor_email)
    if not target_doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Target practitioner not found in system registers."
        )

    # 2. Prevent duplicate pending requests in the active queue
    active_exists = db.query(PrescriptionWorkflow).filter(
        PrescriptionWorkflow.user_id == current_user.id,
        PrescriptionWorkflow.doctor_id == target_doctor.id,
        PrescriptionWorkflow.status == WorkflowStatusEnum.PENDING
    ).first()
    
    if active_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="An active prescription verification request is already pending with this doctor."
        )

    # 3. Call your ChatGroq pipeline function to create the draft string
    try:
        # If your function requires 'self', make sure you call it from its class instance 
        # e.g., prescription_service.generate_draft_prescription(disease_analysis, symptoms)
        ai_draft_prescription = generate_draft_prescription(disease_analysis, symptoms)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Groq LLM Generation Error: {str(e)}"
        )

    # 4. Save and Route to the workflow engine table
    workflow_entry = PrescriptionWorkflow(
        user_id=current_user.id,
        doctor_id=target_doctor.id,
        ai_generated_draft=ai_draft_prescription,  # Storing the generated prescription draft text directly
        status=WorkflowStatusEnum.PENDING
    )
    
    db.add(workflow_entry)
    db.commit()
    db.refresh(workflow_entry)
    
    return {
        "status": "success", 
        "message": "AI Prescription draft successfully compiled and routed to the practitioner queue.",
        "workflow_id": workflow_entry.id
    }