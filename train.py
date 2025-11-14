import os
import shutil
from llama_index.core import (
    VectorStoreIndex, 
    SimpleDirectoryReader, 
    StorageContext
)
from llama_index.core.settings import Settings
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.ollama import OllamaEmbedding
import sys
from typing import List

# --- Configuration ---
# Yeh woh folder hai jahaan se AI data padhega (train hoga)
DATA_DIR = "./media/Data_for_AI" 
PERSIST_DIR = "./storage"

# Model Config
OLLAMA_HOST = "http://localhost:11434"
CHAT_MODEL = "llama3:8b" # Yeh model chat karne ke liye hai
# Embedding (Math) Model: Yeh model notes ko numbers mein badalne ke liye hai (bahut fast)
EMBEDDING_MODEL = "nomic-embed-text" 

def start_training():
    print(f"--- Starting AI Training ---")
    print(f"Chat Model: {CHAT_MODEL}")
    print(f"Embedding (Math) Model: {EMBEDDING_MODEL}")
    
    # Check if storage exists (agar pehle se train hua hai toh)
    if os.path.exists(PERSIST_DIR):
        print(f"'{PERSIST_DIR}' folder pehle se hai.")
        print("Kripya 'storage' folder ko delete karein aur phir se chalaayein.")
        sys.exit()

    # Data folder check karna
    if not os.path.exists(DATA_DIR) or not os.listdir(DATA_DIR):
        print(f"Error: '{DATA_DIR}' folder khaali hai ya mila nahi.")
        print("Kripya files ko 'Data_for_AI' folder mein daal dein.")
        sys.exit()

    try:
        # AI Models ko Set karna
        print("Loading AI models (Ollama)...")
        Settings.llm = Ollama(model=CHAT_MODEL, base_url=OLLAMA_HOST, request_timeout=240.0)
        Settings.embed_model = OllamaEmbedding(model_name=EMBEDDING_MODEL, base_url=OLLAMA_HOST)
        print("Models loaded successfully.")

        # --- Ek-ek karke files load karna (corrupt file se bachne ke liye) ---
        print("Starting to load documents...")
        documents: List[any] = []
        file_count = 0
        
        for dirpath, dirnames, filenames in os.walk(DATA_DIR):
            for filename in filenames:
                # Sirf .pdf, .txt, .md, .docx files ko process karo
                if filename.lower().endswith(('.pdf', '.txt', '.md', '.docx')):
                    file_path = os.path.join(dirpath, filename)
                    print(f"[File {file_count+1}] Loading: {filename}...")
                    try:
                        # Ek file ko load karo
                        file_docs = SimpleDirectoryReader(input_files=[file_path]).load_data()
                        documents.extend(file_docs)
                        print(f"[File {file_count+1}] ...OK! Loaded {filename}.")
                        file_count += 1
                    except Exception as e:
                        # Agar file load na ho toh skip karo
                        print(f"!!!!!!!! FAILED to load {filename}. Skipping file. Error: {e}")
        
        print(f"Total files loaded: {file_count}.")
        if file_count == 0:
            print("Koi valid file nahi mili.")
            sys.exit()

        # "Math Conversion" (Indexing) shuru karna
        print("Now starting indexing (Math conversion)...")
        storage_context = StorageContext.from_defaults()
        # Yeh step ab fast hona chahiye kyunki hum nomic-embed-text use kar rahe hain
        index = VectorStoreIndex.from_documents(documents, storage_context=storage_context)
        
        print("Indexing complete.")
        
        # 'storage' folder mein save karna
        print(f"Saving index to: {PERSIST_DIR}")
        index.storage_context.persist(persist_dir=PERSIST_DIR)
        print("--- TRAINING COMPLETE! ---")

    except Exception as e:
        print(f"\n!!!!!!!! FATAL ERROR during training: {e} !!!!!!!!")
        error_str = str(e)
        if "model 'nomic-embed-text' not found" in error_str or "llama3:8b" in error_str:
            print("--- Error: Koi ek model (nomic-embed-text ya llama3:8b) nahi mila. ---")
            print("--- Please run: ollama pull nomic-embed-text  AND  ollama pull llama3:8b ---")
        elif "Connection refused" in error_str or "Failed to connect to" in error_str:
         print("--- Error: Ollama se connect nahi ho raha. ---")
         print(f"--- Kripya check karein ki Ollama app chalu hai ya nahi (Host: {OLLAMA_HOST}). ---")
         print("--- Agar Ollama chalu hai, toh dekhein ki woh 11434 port par chal raha hai ya nahi. ---")
        else:
         print("--- Kripya upar diye gaye error ko check karein. ---")


if __name__ == "__main__":
    start_training()