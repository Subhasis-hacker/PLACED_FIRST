import asyncio
import json
import logging
import os
import uuid
from dataclasses import dataclass

from dotenv import load_dotenv
from langchain_community.vectorstores import FAISS
from langchain_core.output_parsers import StrOutputParser
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.db.schemas import StructuredMedicalReport

load_dotenv()

logger = logging.getLogger(__name__)
output_parser = StrOutputParser()

_embeddings = None
_llm = None


@dataclass
class TemporaryReportSession:
    text: str
    vector_store: FAISS
    report: StructuredMedicalReport


TEMP_REPORT_SESSIONS: dict[str, TemporaryReportSession] = {}


def _get_embeddings():
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    return _embeddings


def _get_llm():
    global _llm
    if _llm is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return None
        _llm = ChatGroq(groq_api_key=api_key, model="llama-3.3-70b-versatile", temperature=0.1)
    return _llm


def _chunk_text(text: str):
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
    return splitter.create_documents([text])


def _extract_json(text: str) -> dict:
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start:end + 1]
    return json.loads(cleaned)


def _fallback_report(text: str, language: str) -> StructuredMedicalReport:
    preview = " ".join(text.split())[:900] or "No readable report text was found."
    return StructuredMedicalReport(
        medical_summary=preview,
        precautions=["Monitor symptoms and keep your medical records available for clinical review."],
        primary_treatments=["Rest, hydrate, and track symptoms while waiting for clinical advice."],
        when_to_seek_clinical_care=["Seek clinical care for interpretation, diagnosis, and treatment decisions."],
        medical_disclaimer="This assistant is for informational purposes only. Do not self-medicate based on AI output. Consult a qualified healthcare professional for medical advice, diagnosis, or treatment."
    )


def _generate_structured_report(text: str, language: str) -> StructuredMedicalReport:
    llm = _get_llm()
    if llm is None:
        logger.warning("GROQ_API_KEY is missing; using fallback structured report.")
        return _fallback_report(text, language)

    prompt = (
        "You are a patient-facing health advisory AI. Analyze only the uploaded report text. "
        "Do not fabricate facts, do not diagnose beyond evidence, and never prescribe medicine. "
        "Your focus is to extract and summarize precautions, safe over-the-counter or home-based primary treatments, "
        "and when the patient should seek clinical care. "
        f"Return every field in {language}. Return strict JSON only with these keys: "
        "medical_summary (string), precautions (array of strings), primary_treatments (array of strings), "
        "when_to_seek_clinical_care (array of strings), and medical_disclaimer (string). "
        "The medical_disclaimer MUST advise the user to consult a healthcare professional for severe symptoms. "
        "Use arrays of strings where requested. If unavailable, state that honestly.\n\n"
        f"Report text:\n{text[:14000]}"
    )
    response = llm.invoke(prompt)
    content = output_parser.invoke(getattr(response, "content", str(response)))
    try:
        return StructuredMedicalReport.model_validate(_extract_json(content))
    except Exception as exc:
        logger.warning("Structured report parse failed: %s", exc)
        return _fallback_report(text, language)


def _create_session_sync(text: str, language: str) -> tuple[str, StructuredMedicalReport]:
    documents = _chunk_text(text)
    vector_store = FAISS.from_documents(documents, _get_embeddings())
    report = _generate_structured_report(text, language)
    session_id = uuid.uuid4().hex
    TEMP_REPORT_SESSIONS[session_id] = TemporaryReportSession(text=text, vector_store=vector_store, report=report)
    return session_id, report


async def create_temporary_report_session(text: str, language: str) -> tuple[str, StructuredMedicalReport]:
    return await asyncio.to_thread(_create_session_sync, text, language)


def _answer_sync(session_id: str | None, question: str, history_text: str, language: str) -> str:
    if not session_id or session_id not in TEMP_REPORT_SESSIONS:
        return "I don't know. Please upload a medical PDF first so I can answer from your report."

    session = TEMP_REPORT_SESSIONS[session_id]
    docs = session.vector_store.similarity_search(question, k=4)
    context = "\n\n".join(doc.page_content for doc in docs)
    llm = _get_llm()
    if llm is None:
        return "I don't know. The AI model is not configured, so I cannot safely answer beyond the uploaded report preview."

    prompt = (
        "You are a polite, patient-facing health advisory AI. Answer using the uploaded report chunks, "
        "conversation history, and safe general medical knowledge. Focus on safe home-care, precautions, and first-aid. "
        "Never invent report facts, never prescribe medicines, and say \"I don't know\" when information is unavailable. "
        "Always append a standard medical disclaimer advising the user to consult a healthcare professional for severe symptoms. "
        f"Reply in {language}.\n\nRetrieved report chunks:\n{context}\n\n"
        f"Conversation history:\n{history_text}\n\nQuestion:\n{question}"
    )
    response = llm.invoke(prompt)
    return output_parser.invoke(getattr(response, "content", str(response))).strip()


async def answer_question(session_id: str | None, question: str, history_text: str, language: str) -> str:
    return await asyncio.to_thread(_answer_sync, session_id, question, history_text, language)
