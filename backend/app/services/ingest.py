from io import BytesIO
from pypdf import PdfReader
from app.services.summary import run_rag
async def process_pdf(content: bytes):

    pdf = PdfReader(BytesIO(content))

    text = ""

    for page in pdf.pages:
        text += page.extract_text() + "\n"

    response = run_rag(text)

    return response
