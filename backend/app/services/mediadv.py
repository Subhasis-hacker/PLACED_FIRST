import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from app.db.schemas import ChatPayload, DemographicsExtractor, MedicalReport

load_dotenv()

api_key = os.getenv("GROQ_API_KEY")
llm = ChatGroq(groq_api_key=api_key, model="llama-3.3-70b-versatile", temperature=0.1)

def generate_follow_up(state: ChatPayload) -> ChatPayload:
    # Pass the state.language parameter into the system instructions
    system_prompt = (
        f"You are a clinical triage AI assistant. Patient baseline data: {state.demographics}. "
        f"Primary symptom reported: {state.raw_symptoms}. Review the chat history and ask exactly ONE "
        f"concise, highly targeted multiple-choice or direct question to clarify symptoms. Do not diagnose. "
        f"CRITICAL: You must converse and write your entire response completely in {state.language}." # ◄--- ADD THIS
    )
    messages = [{"role": "system", "content": system_prompt}] + state.chat_history[-4:]
    response = llm.invoke(messages)
    
    state.chat_history.append({"role": "assistant", "content": response.content})
    return state


def generate_final_report(state: ChatPayload) -> ChatPayload:
    structured_report_llm = llm.with_structured_output(MedicalReport)
    
    system_prompt = (
        "You are an expert medical diagnostic engine. Analyze the patient profile, "
        "taking critical note of their medical history and pre-existing diseases. "
        "Analyze their core symptoms and answers to follow-up questions to provide a "
        "structured clinical assessment. Prioritize safety and point out if their past history worsens their current risk. "
        f"CRITICAL: All textual descriptions, keys explanations, values, and precaution lists inside the generated JSON MUST be written in {state.language}." # ◄--- ADD THIS
    )
    
    input_data = (
        f"Demographics: Age {state.demographics['age']}, Sex {state.demographics['gender']}, Wt: {state.demographics['weight']}, Ht: {state.demographics['height']}\n"
        f"Medical History/Past Diseases: {state.demographics['previous_diseases']}\n"
        f"Current Symptoms: {state.raw_symptoms}\n"
        f"Chat Interview History: {state.chat_history}"
    )
    
    final_json = structured_report_llm.invoke([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": input_data}
    ])
    
    state.final_output = final_json.model_dump()
    
    # Optional: You can also translate or keep the state transition message in their language
    state.chat_history.append({
        "role": "assistant", 
        "content": f"Assessment complete! Generating your dashboard in {state.language} now..."
    })
    return state

def orchestrate_chat_flow(payload: ChatPayload) -> ChatPayload:
    """
    Main state controller processing business and LLM logic stage-by-stage.
    """
    last_user_message = payload.chat_history[-1]["content"]

    # --- STAGE 1: DEMOGRAPHICS & MEDICAL HISTORY ---
    if payload.current_stage == "DEMOGRAPHICS":
        structured_llm = llm.with_structured_output(DemographicsExtractor)
        extraction_prompt = (
            "Analyze this conversation history and extract age, gender, weight, height, "
            f"and any past/previous medical conditions or diseases:\n{payload.chat_history}"
        )
        extracted = structured_llm.invoke(extraction_prompt)
        
        extracted_dict = extracted.model_dump()
        for key in ["age", "gender", "weight", "height", "previous_diseases"]:
            if extracted_dict[key] is not None:
                payload.demographics[key] = str(extracted_dict[key])
                
        if all(payload.demographics.values()):
            payload.current_stage = "INTAKE"
            payload.chat_history.append({
                "role": "assistant", 
                "content": "Thank you. Your baseline profile and past history are recorded. Please describe the primary medical symptoms or concerns you are experiencing today."
            })
        # Look for the else block inside "if all(payload.demographics.values()):"
        else:
            missing_labels = {
                "age": "Age", "gender": "Biological Sex", 
                "weight": "Weight", "height": "Height", 
                "previous_diseases": "Any pre-existing medical conditions or past diseases"
            }
            missing = [missing_labels[k] for k, v in payload.demographics.items() if v is None]
            
            # Use a quick prompt or directly instruct the LLM to ask for these items in the requested language
            prompt = f"Ask the user politely to provide these missing profile metrics: {', '.join(missing)}. Write your response completely in {payload.language}."
            response = llm.invoke(prompt)
            
            payload.chat_history.append({
                "role": "assistant", 
                "content": response.content # ◄--- Use the LLM generated translation instead of hardcoded English text
            })
        return payload

    # --- STAGE 2: INTAKE ---
    elif payload.current_stage == "INTAKE":
        payload.raw_symptoms = last_user_message
        payload.current_stage = "FOLLOW_UP"
        payload.follow_up_count = 1
        return generate_follow_up(payload)

    # --- STAGE 3: FOLLOW_UP LOOP ---
    elif payload.current_stage == "FOLLOW_UP":
        payload.follow_up_count += 1
        if payload.follow_up_count > 3:
            payload.current_stage = "FINAL"
            return generate_final_report(payload)
        else:
            return generate_follow_up(payload)

    return payload