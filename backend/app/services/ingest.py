from io import BytesIO
from pypdf import PdfReader
from app.services.summary import run_rag
async def process_pdf(content: bytes,language: str):

    pdf = PdfReader(BytesIO(content))

    text = ""

    for page in pdf.pages:
        text += page.extract_text() + "\n"

    response = run_rag(text,language=language)  # Pass the language parameter to run_rag

    return response
