import os
from dotenv import load_dotenv

from langchain.chains import create_history_aware_retriever
from langchain_community.vectorstores import FAISS
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder, PromptTemplate
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain.chains.summarize import load_summarize_chain
from langchain_core.output_parsers import StrOutputParser

# Initialize output parser
output_parser = StrOutputParser()

load_dotenv()

os.environ['HF_TOKEN'] = os.getenv("HF_TOKEN")
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
api_key = os.getenv("GROQ_API_KEY")

# FIX 1: Added 'language' parameter. Adjusted default question logic safely inside the function body.
def run_rag(text, user_question=None, chat_history=None, language="English"):
    if chat_history is None:
        chat_history = ChatMessageHistory()
        
    if user_question is None:
        user_question = f"What is the summary of the PDF in {language}?"

    # 1. Text Chunking
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = text_splitter.create_documents([text])

    # 2. FAISS Vector Database Implementation
    vector_db = FAISS.from_documents(chunks, embeddings)
    base_retriever = vector_db.as_retriever(search_kwargs={"k": 4})

    # 3. LLM Setup
    llm = ChatGroq(groq_api_key=api_key, model="llama-3.3-70b-versatile", temperature=0.1)   

    # 4. History-Aware Retriever Setup
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
    retrieved_docs = history_aware_retriever.invoke({
        "input": user_question,
        "history": chat_history.messages
    })

    # ========================================================
    # 6. REFINE DOCUMENT CHAIN CONFIGURATION (MEDICAL CLINICAL FOCUS)
    # ========================================================
    initial_medical_prompt = """
    You are an expert medical assistant analyzer. Your job is to extract, evaluate, and summarize clinical information accurately based on the provided text fragment. Do not extrapolate information not present in the document.
    
    Document text fragment:
    "{text}"
    
    CONCISE INITIAL MEDICAL SUMMARY/ANALYSIS:
    CRITICAL: You must write the entire summary/analysis in {language}.
    """
    # FIX 2: Explicitly added "language" to input_variables
    INITIAL_PROMPT = PromptTemplate(template=initial_medical_prompt, input_variables=["text", "language"])

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
    
    CRITICAL: The entire final report must be written in {language}.
    """
    # FIX 3: Explicitly added "language" to input_variables
    REFINE_PROMPT = PromptTemplate(
        template=refine_medical_prompt, 
        input_variables=["existing_answer", "text", "language"]
    )

    refine_chain = load_summarize_chain(
        llm=llm,
        chain_type="refine",
        question_prompt=INITIAL_PROMPT,
        refine_prompt=REFINE_PROMPT,
        document_variable_name="text"
    )

    # 7. Execute the raw chain FIRST
    # FIX 4: Passed the 'language' variable through to satisfy the PromptTemplate variables
    chain_output = refine_chain.invoke({
        "input_documents": retrieved_docs,
        "language": language
    })
    
    # 8. Safely unwrap the dictionary keys BEFORE passing to the output parser
    if isinstance(chain_output, dict) and "output_text" in chain_output:
        text_to_parse = chain_output["output_text"]
    elif isinstance(chain_output, dict) and "output" in chain_output:
        text_to_parse = chain_output["output"]
    else:
        text_to_parse = chain_output
    
    # 9. Pass the clean string to the output parser
    final_clean_text = output_parser.invoke(text_to_parse)
    
    # Update chat history statefully
    chat_history.add_user_message(user_question)
    chat_history.add_ai_message(final_clean_text)

    return {
        "summary": final_clean_text,
        "updated_history": chat_history
    }
    
