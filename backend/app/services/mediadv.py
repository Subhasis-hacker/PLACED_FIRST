import os
import re
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from app.db.schemas import MedicalChatRequest

load_dotenv()

api_key = os.getenv("GROQ_API_KEY")
llm = ChatGroq(groq_api_key=api_key, model="llama-3.3-70b-versatile", temperature=0.2)


def _clean_formal_reply(text: str) -> str:
    """Return a single formal paragraph without JSON-like formatting."""
    if not text:
        return "I am unable to prepare a response at this moment. Please consult a qualified medical professional if your symptoms are urgent."

    cleaned = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
    cleaned = re.sub(r"[\{\}\[\]\"]", "", cleaned)
    cleaned = re.sub(r"\\n|\r|\n|\t", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def generate_medical_chat_reply(payload: MedicalChatRequest) -> str:
    """
    Produces a patient-facing chatbot answer as concise formal prose.
    The response intentionally avoids JSON, markdown, and newline-heavy formatting.
    """
    recent_history = [
        {"role": item.role, "content": item.content}
        for item in payload.history[-6:]
        if item.content.strip()
    ]

    system_prompt = (
        "You are Medi, a formal medical support chatbot for the medi-friend application. "
        "You are represented in the interface as a small caregiver doll wearing a stethoscope, but your tone must remain professional, calm, and clinically responsible. "
        "Do not provide a final diagnosis, do not prescribe medication, and do not claim to replace a doctor. "
        "Explain medical report information in plain language, suggest safe next steps, and advise urgent care for severe symptoms such as chest pain, breathing difficulty, fainting, stroke-like symptoms, severe bleeding, or rapidly worsening condition. "
        f"Respond completely in {payload.language}. "
        "Return only one concise formal paragraph. Do not use JSON, markdown headings, bullet points, code blocks, or newline characters."
    )

    context_message = ""
    if payload.context:
        context_message = f"Relevant patient report context: {payload.context[:3000]}"

    messages = [{"role": "system", "content": system_prompt}]
    if context_message:
        messages.append({"role": "user", "content": context_message})
    messages.extend(recent_history)
    messages.append({"role": "user", "content": payload.message})

    response = llm.invoke(messages)
    return _clean_formal_reply(getattr(response, "content", str(response)))
