## RAG Q&A Conversation With PDF Including Chat History (Medical Focus)
import os
from dotenv import load_dotenv

from langchain.chains import create_history_aware_retriever
# Corrected typo in community import
from langchain_community.vectorstores import FAISS
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder, PromptTemplate
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain.chains.summarize import load_summarize_chain

load_dotenv()

os.environ['HF_TOKEN'] = os.getenv("HF_TOKEN")
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
api_key = os.getenv("GROQ_API_KEY")

def run_rag(text, user_question="What is the summary of the PDF?", chat_history=None):
    if chat_history is None:
        chat_history = ChatMessageHistory()

    # 1. Text Chunking
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = text_splitter.create_documents([text])

    # 2. FAISS Vector Database Implementation
    # Note: FAISS.from_documents does not use a 'collection_name' parameter like Chroma does.
    vector_db = FAISS.from_documents(chunks, embeddings)
    base_retriever = vector_db.as_retriever(search_kwargs={"k": 4})

    # 3. LLM Setup (Using a reliable Groq model)
    # Change the model parameter inside app/services/summary.py
    llm = ChatGroq(groq_api_key=api_key, model="llama-3.3-70b-versatile",temperature=0.1)   

    # 4. History-Aware Retriever Setup
    # This reformulates the user's latest question if it references past history
    contextualize_q_system_prompt = (
        "Given a chat history and the latest user question "
        "which might reference context in the chat history, "
        "formulate a standalone question which can be understood "
        "without the chat history. Do NOT answer the question, "
        "just reformulate it if needed and otherwise return it as is."
    )
    contextualize_q_prompt = ChatPromptTemplate.from_messages([
        ("system", contextualize_q_system_prompt),
        MessagesPlaceholder(variable_name="history"),
        ("human", "{input}"),
    ])
    
    history_aware_retriever = create_history_aware_retriever(
        llm=llm, 
        retriever=base_retriever, 
        prompt=contextualize_q_prompt
    )

    # 5. Fetch History-Aware Documents from FAISS
    # We pass the history and current question to get the exact relevant chunks
    retrieved_docs = history_aware_retriever.invoke({
        "input": user_question,
        "history": chat_history.messages
    })

    # ========================================================
    # 6. REFINE DOCUMENT CHAIN CONFIGURATION (MEDICAL CLINICAL FOCUS)
    # ========================================================
    
    # Prompt applied to the very first document chunk analyzed
    initial_medical_prompt = """
    You are an expert medical assistant analyzer. Your job is to extract, evaluate, and summarize clinical information accurately based on the provided text fragment. Do not extrapolate information not present in the document.
    
    Document text fragment:
    "{text}"
    
    CONCISE INITIAL MEDICAL SUMMARY/ANALYSIS:
    """
    INITIAL_PROMPT = PromptTemplate(template=initial_medical_prompt, input_variables=["text"])

    # Prompt applied to all subsequent document chunks to progressively refine the analysis
    refine_medical_prompt = """
    You are an expert medical assistant analyzer. Your objective is to produce a cohesive, precise final clinical summary.
    We have provided an existing summary/analysis up to a certain point:
    "{existing_answer}"

    We now have the opportunity to update and refine this analysis with new clinical evidence or context from an additional section of the record below.
    ------------
    "{text}"
    ------------

    Given this new clinical context, seamlessly refine the original summary to create a more comprehensive, structured report. 
    Maintain strict medical accuracy. If the new section contains repetitive information or nothing relevant, output the original summary exactly.
    """
    REFINE_PROMPT = PromptTemplate(
        template=refine_medical_prompt, 
        input_variables=["existing_answer", "text"]
    )

    # Load the specialized refine processing chain
    refine_chain = load_summarize_chain(
        llm=llm,
        chain_type="refine",
        question_prompt=INITIAL_PROMPT,
        refine_prompt=REFINE_PROMPT,
        document_variable_name="text"
    )

    # 7. Execute the chain across your FAISS documents
    # The Refine chain iterates sequentially through every retrieved document block
    chain_output = refine_chain.invoke({"input_documents": retrieved_docs})
    
    # Update chat history statefully for sequential questions
    chat_history.add_user_message(user_question)
    chat_history.add_ai_message(chain_output["output_text"])

    return {
        "summary": chain_output["output_text"],
        "updated_history": chat_history
    }