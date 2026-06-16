from fastapi import FastAPI, Form, UploadFile, File
from app.services.ingest import process_pdf

app = FastAPI(
    title="RAG API", 
    description="A simple RAG API using FastAPI and LangChain", 
    version="0.1.0"
)

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