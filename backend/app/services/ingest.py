from io import BytesIO

from fastapi import HTTPException, UploadFile, status
from pypdf import PdfReader

from app.services.rag_service import create_temporary_report_session


def extract_pdf_text(content: bytes) -> str:
    reader = PdfReader(BytesIO(content))
    pages = [(page.extract_text() or "") for page in reader.pages]
    return "\n".join(pages).strip()


async def analyze_pdf(file: UploadFile, language: str):
    if file.content_type not in {"application/pdf", "application/octet-stream"} and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF reports are supported.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded PDF is empty.")

    extracted_text = extract_pdf_text(content)
    if not extracted_text:
        extracted_text = "No readable text was found. OCR is required for this scanned report."

    session_id, structured_report = await create_temporary_report_session(extracted_text, language)
    return session_id, structured_report, extracted_text[:1200]
