from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.db import engine, Base, get_db
from app.models import UserModel
from app.db.schemas import UserCreate, UserResponse, Token, MedicalChatRequest, MedicalChatResponse, DoctorCreate, DoctorResponse, WorkflowSubmit, PrescriptionApproval, PrescriptionUpdate, DoctorModel,PrescriptionWorkflow,WorkflowStatusEnum
from app.services.auth import (authenticate_user, create_access_token, get_current_active_user, get_password_hash,ACCESS_TOKEN_EXPIRE_MINUTES,get_doctor_by_email,create_role_access_token,get_current_doctor,authenticate_doctor)
from fastapi import Depends, FastAPI, Form, UploadFile, File,HTTPException,status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from app.services.ingest import process_pdf
from datetime import datetime, timedelta
from app.services.mediadv import generate_medical_chat_reply
from fastapi.middleware.cors import CORSMiddleware
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from fastapi.responses import StreamingResponse
import io
import json
from html import escape
from app.services.prescription_generator import generate_draft_prescription


app = FastAPI(title="medi-friend", description="A simple RAG API using FastAPI and LangChain", version="0.1.0")



Base.metadata.create_all(bind=engine)

def _ensure_sqlite_workflow_columns():
    """Lightweight local migration for existing SQLite dev databases."""
    if not str(engine.url).startswith("sqlite"):
        return

    desired_columns = {
        "patient_language": "VARCHAR(32) NOT NULL DEFAULT 'English'",
        "uploaded_filename": "VARCHAR(255)",
        "prescription_data": "JSON",
        "clinical_remarks": "TEXT",
        "approved_at": "DATETIME",
    }

    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(prescription_workflows)")).fetchall()
        existing = {row[1] for row in rows}
        for column_name, column_type in desired_columns.items():
            if column_name not in existing:
                conn.execute(text(f"ALTER TABLE prescription_workflows ADD COLUMN {column_name} {column_type}"))

_ensure_sqlite_workflow_columns()

app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_credentials=True,allow_methods=["*"],allow_headers=["*"],)


def _serialize_prescription(medications, remarks=""):
    return json.dumps(
        {"medications": medications or [], "remarks": remarks or ""},
        ensure_ascii=False
    )


def _case_to_dict(case: PrescriptionWorkflow, patient: UserModel = None, doctor: DoctorModel = None):
    return {
        "id": case.id,
        "case_id": case.id,
        "user_id": case.user_id,
        "doctor_id": case.doctor_id,
        "patient_name": patient.username if patient else None,
        "patient_email": patient.email if patient else None,
        "doctor_name": doctor.name if doctor else None,
        "doctor_email": doctor.email if doctor else None,
        "patient_language": case.patient_language or "English",
        "uploaded_filename": case.uploaded_filename,
        "ai_analysis": case.ai_generated_draft,
        "ai_generated_draft": case.ai_generated_draft,
        "prescription": case.prescription_data or [],
        "clinical_remarks": case.clinical_remarks or "",
        "final_prescription": case.final_prescription,
        "status": case.status.value if hasattr(case.status, "value") else case.status,
        "created_at": case.created_at,
        "updated_at": case.updated_at,
        "approved_at": case.approved_at,
    }


def _default_prescription_seed():
    return [
        {
            "drug_name": "",
            "dosage": "",
            "frequency": "",
            "duration": "",
        }
    ]


def _medication_to_dict(item):
    if hasattr(item, "model_dump"):
        return item.model_dump()
    if hasattr(item, "dict"):
        return item.dict()
    return dict(item)




# 1. Registration endpoint to save users to your cloud DB
@app.post("/register", response_model=UserResponse)
def register_user(user_in: UserCreate, db: Session = Depends(get_db)):
    normalized_email = user_in.email.lower().strip()
    normalized_username = user_in.username.strip()
    # 1. Check if the username is already taken
    username_exists = db.query(UserModel).filter(UserModel.username == normalized_username).first()
    if username_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Username already registered"
        )
    
    # 2. Check if the email is already taken (This prevents the UniqueViolation crash)
    email_exists = db.query(UserModel).filter(UserModel.email == normalized_email).first()
    doctor_email_exists = get_doctor_by_email(db, normalized_email)
    if email_exists or doctor_email_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Email already registered"
        )
    
    # 3. Safe to proceed if both checks pass
    hashed_pwd = get_password_hash(user_in.password)
    new_user = UserModel(
        username=normalized_username,
        email=normalized_email,
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
@app.post("/chat", response_model=MedicalChatResponse)
async def chat_endpoint(payload: MedicalChatRequest):
    reply = generate_medical_chat_reply(payload)
    return {"reply": reply}


@app.post("/api/medical/cases/forward")
async def forward_case_to_doctor(
    payload: WorkflowSubmit,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    target_doctor = get_doctor_by_email(db, payload.doctor_email)
    if not target_doctor:
        raise HTTPException(status_code=404, detail="Doctor email is not registered in medi-friend.")

    active_exists = db.query(PrescriptionWorkflow).filter(
        PrescriptionWorkflow.user_id == current_user.id,
        PrescriptionWorkflow.doctor_id == target_doctor.id,
        PrescriptionWorkflow.status.in_([WorkflowStatusEnum.DRAFTED, WorkflowStatusEnum.UNDER_REVIEW])
    ).first()
    if active_exists:
        raise HTTPException(status_code=400, detail="This doctor already has an active case from you.")

    workflow_entry = PrescriptionWorkflow(
        user_id=current_user.id,
        doctor_id=target_doctor.id,
        ai_generated_draft=payload.ai_response_text,
        patient_language=payload.patient_language,
        uploaded_filename=payload.uploaded_filename,
        prescription_data=_default_prescription_seed(),
        status=WorkflowStatusEnum.UNDER_REVIEW
    )
    db.add(workflow_entry)
    db.commit()
    db.refresh(workflow_entry)

    return {
        "status": "success",
        "message": "Case data forwarded to the doctor's review queue.",
        "case": _case_to_dict(workflow_entry, current_user, target_doctor),
    }


@app.get("/api/medical/doctor/cases")
async def get_doctor_cases(
    email: str,
    current_doctor: DoctorModel = Depends(get_current_doctor),
    db: Session = Depends(get_db)
):
    if current_doctor.email.lower() != email.lower():
        raise HTTPException(status_code=403, detail="Doctor queue access is restricted to the logged-in clinician.")

    rows = db.query(PrescriptionWorkflow, UserModel).join(
        UserModel, PrescriptionWorkflow.user_id == UserModel.id
    ).filter(
        PrescriptionWorkflow.doctor_id == current_doctor.id,
        PrescriptionWorkflow.status == WorkflowStatusEnum.UNDER_REVIEW
    ).order_by(PrescriptionWorkflow.created_at.desc()).all()

    return [_case_to_dict(case, patient, current_doctor) for case, patient in rows]


@app.put("/api/medical/cases/{case_id}/prescription")
async def update_case_prescription(
    case_id: int,
    payload: PrescriptionUpdate,
    current_doctor: DoctorModel = Depends(get_current_doctor),
    db: Session = Depends(get_db)
):
    case = db.query(PrescriptionWorkflow).filter(
        PrescriptionWorkflow.id == case_id,
        PrescriptionWorkflow.doctor_id == current_doctor.id
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found in this doctor's workspace.")
    if case.status == WorkflowStatusEnum.APPROVED:
        raise HTTPException(status_code=409, detail="Approved prescriptions are locked and cannot be edited.")

    case.prescription_data = [_medication_to_dict(item) for item in payload.medications]
    case.clinical_remarks = payload.remarks
    case.status = WorkflowStatusEnum.UNDER_REVIEW
    db.commit()
    db.refresh(case)

    patient = db.query(UserModel).filter(UserModel.id == case.user_id).first()
    return {"status": "success", "case": _case_to_dict(case, patient, current_doctor)}


@app.post("/api/medical/cases/{case_id}/approve")
async def approve_case(
    case_id: int,
    payload: PrescriptionApproval,
    current_doctor: DoctorModel = Depends(get_current_doctor),
    db: Session = Depends(get_db)
):
    case = db.query(PrescriptionWorkflow).filter(
        PrescriptionWorkflow.id == case_id,
        PrescriptionWorkflow.doctor_id == current_doctor.id
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found in this doctor's workspace.")

    medications = [_medication_to_dict(item) for item in payload.medications]
    case.prescription_data = medications
    case.clinical_remarks = payload.remarks
    case.final_prescription = _serialize_prescription(medications, payload.remarks)
    case.approved_at = datetime.utcnow()
    case.status = WorkflowStatusEnum.APPROVED
    db.commit()
    db.refresh(case)

    patient = db.query(UserModel).filter(UserModel.id == case.user_id).first()
    return {"status": "success", "message": "Prescription approved, signed, and transmitted.", "case": _case_to_dict(case, patient, current_doctor)}


@app.get("/api/medical/patient/cases")
async def get_patient_cases(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    rows = db.query(PrescriptionWorkflow, DoctorModel).join(
        DoctorModel, PrescriptionWorkflow.doctor_id == DoctorModel.id
    ).filter(
        PrescriptionWorkflow.user_id == current_user.id
    ).order_by(PrescriptionWorkflow.created_at.desc()).all()

    return [_case_to_dict(case, current_user, doctor) for case, doctor in rows]


@app.get("/api/medical/cases/{case_id}/download")
async def download_final_prescription(
    case_id: int,
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    record = db.query(PrescriptionWorkflow).filter(
        PrescriptionWorkflow.id == case_id,
        PrescriptionWorkflow.user_id == current_user.id,
        PrescriptionWorkflow.status == WorkflowStatusEnum.APPROVED
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Approved prescription is not available for this case.")

    doctor = db.query(DoctorModel).filter(DoctorModel.id == record.doctor_id).first()
    medications = record.prescription_data or []

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=48, leftMargin=48, topMargin=48, bottomMargin=48)
    story = []
    styles = getSampleStyleSheet()

    story.append(Paragraph("<b>medi-friend Official Prescription</b>", styles["Title"]))
    story.append(Spacer(1, 14))
    story.append(Paragraph(f"<b>Patient:</b> {escape(current_user.username)}", styles["Normal"]))
    story.append(Paragraph(f"<b>Doctor:</b> Dr. {escape(doctor.name if doctor else 'Clinician')} ({escape(doctor.email if doctor else '')})", styles["Normal"]))
    story.append(Paragraph(f"<b>Approved:</b> {record.approved_at.strftime('%d %b %Y, %I:%M %p') if record.approved_at else 'Signed'}", styles["Normal"]))
    story.append(Spacer(1, 18))
    story.append(Paragraph("<b>Medication Plan</b>", styles["Heading2"]))

    if medications:
        for index, med in enumerate(medications, start=1):
            line = (
                f"{index}. {escape(med.get('drug_name') or 'Medication')} - "
                f"{escape(med.get('dosage') or 'Dosage not specified')}, "
                f"{escape(med.get('frequency') or 'Frequency not specified')}, "
                f"{escape(med.get('duration') or 'Duration not specified')}"
            )
            story.append(Paragraph(line, styles["BodyText"]))
            story.append(Spacer(1, 6))
    else:
        story.append(Paragraph("No medications listed. Follow clinical remarks.", styles["BodyText"]))

    if record.clinical_remarks:
        story.append(Spacer(1, 14))
        story.append(Paragraph("<b>Clinical Remarks</b>", styles["Heading2"]))
        story.append(Paragraph(escape(record.clinical_remarks), styles["BodyText"]))

    story.append(Spacer(1, 24))
    story.append(Paragraph("<b>Digital Signature:</b> Verified through medi-friend clinician approval workflow.", styles["Normal"]))

    doc.build(story)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=medi_friend_prescription_{case_id}.pdf"}
    )



##5 docotor register endpoint
@app.post("/doctor/register", response_model=DoctorResponse)
def register_doctor(doc_in: DoctorCreate, db: Session = Depends(get_db)):
    normalized_email = doc_in.email.lower().strip()
    if get_doctor_by_email(db, normalized_email):
        raise HTTPException(status_code=400, detail="Email already registered for a professional practitioner.")
    if db.query(UserModel).filter(UserModel.email == normalized_email).first():
        raise HTTPException(status_code=400, detail="Email already registered for a patient account.")
    
    new_doc = DoctorModel(
        name=doc_in.name.strip(),
        email=normalized_email,
        hashed_password=get_password_hash(doc_in.password)
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    return new_doc

###6 doctor login endpoint
@app.post("/doctor/token")
async def login_doctor(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    doctor = authenticate_doctor(db, form_data.username.lower().strip(), form_data.password) # form_data.username passes email here
    if not doctor:
        raise HTTPException(status_code=401, detail="Invalid clinician credentials.")
    
    token = create_role_access_token(data={"sub": doctor.email}, role="doctor")
    return {
        "access_token": token,
        "token_type": "bearer",
        "doctor": {"id": doctor.id, "name": doctor.name, "email": doctor.email}
    }

@app.get("/doctor/me", response_model=DoctorResponse)
async def read_doctor_me(current_doctor: DoctorModel = Depends(get_current_doctor)):
    return current_doctor

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
        PrescriptionWorkflow.status == WorkflowStatusEnum.UNDER_REVIEW
    ).first()
    
    if active_exists:
        raise HTTPException(status_code=400, detail="An active prescription verification request is already pending with this doctor.")

    workflow_entry = PrescriptionWorkflow(
        user_id=current_user.id,
        doctor_id=target_doctor.id,
        ai_generated_draft=payload.ai_response_text,
        patient_language=payload.patient_language,
        uploaded_filename=payload.uploaded_filename,
        prescription_data=_default_prescription_seed(),
        status=WorkflowStatusEnum.UNDER_REVIEW
    )
    db.add(workflow_entry)
    db.commit()
    return {"status": "success", "message": "Draft successfully routed to the practitioner queue."}

@app.get("/doctor/queue")
async def get_doctor_active_queue(current_doctor: DoctorModel = Depends(get_current_doctor), db: Session = Depends(get_db)):
    """Step 2: Doctor fetches their active workspace workload."""
    return db.query(PrescriptionWorkflow).filter(
        PrescriptionWorkflow.doctor_id == current_doctor.id,
        PrescriptionWorkflow.status == WorkflowStatusEnum.UNDER_REVIEW
    ).all()
    
@app.post("/doctor/prescription/approve")
async def approve_and_finalize_prescription(
    payload: dict, 
    current_doctor: DoctorModel = Depends(get_current_doctor), 
    db: Session = Depends(get_db)
):
    """
    Step 3: Doctor modifies the prescription payload data array.
    Instead of a dangerous hard-delete, we set status to APPROVED to remove it from the active queue.
    """
    workflow_id = payload.get("workflow_id")
    final_text = payload.get("doctor_edited_medications") or payload.get("prescription_data") or ""
    workflow = db.query(PrescriptionWorkflow).filter(
        PrescriptionWorkflow.id == workflow_id,
        PrescriptionWorkflow.doctor_id == current_doctor.id
    ).first()

    if not workflow:
        raise HTTPException(status_code=404, detail="Target workflow context vector not verified.")

    # Write modifications and switch status to clear the queue
    workflow.final_prescription = final_text
    workflow.clinical_remarks = final_text if isinstance(final_text, str) else ""
    workflow.approved_at = datetime.utcnow()
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
        PrescriptionWorkflow.status == WorkflowStatusEnum.UNDER_REVIEW
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
        patient_language="English",
        prescription_data=_default_prescription_seed(),
        status=WorkflowStatusEnum.UNDER_REVIEW
    )
    
    db.add(workflow_entry)
    db.commit()
    db.refresh(workflow_entry)
    
    return {
        "status": "success", 
        "message": "AI Prescription draft successfully compiled and routed to the practitioner queue.",
        "workflow_id": workflow_entry.id
    }


## for error
from fastapi.exceptions import RequestValidationError
from fastapi import Request
from fastapi.responses import JSONResponse
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print("❌ FRONTEND SENT INVALID DATA:", exc.errors())
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )
