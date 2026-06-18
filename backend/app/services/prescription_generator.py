import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
load_dotenv()


api_key = os.getenv("GROQ_API_KEY")
llm = ChatGroq(groq_api_key=api_key, model="llama-3.3-70b-versatile", temperature=0.1)


def generate_draft_prescription(self, disease_analysis: str, symptoms: str) -> str:
    """Generates a non-binding prescription draft based exclusively on extracted context."""
    prompt = f"""
    You are an AI Medical Assistant. Based on the following established disease analysis and symptoms, construct a DRAFT prescription plan.
        
    CRITICAL REASONING SAFEGUARD: This is a draft for review by a licensed medical practitioner. It is NOT a final medical order.
        
    [Identified Diseases & Biomarkers]
    {disease_analysis}
        
    [Patient Symptoms]
    {symptoms}
        
    Generate a structured draft containing:
    - Recommended Dietary / Lifestyle Alterations
    - Suggested Pharmacological Interventions (Include generic drug name placeholder, suggested dosage cadence, and justification mapping back to the lab findings)
     - Flagged Contraindications or Warning Symptoms for Doctor review.
    """
    response = self.llm.invoke(prompt)
    return response.content

