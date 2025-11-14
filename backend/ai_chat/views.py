# backend/ai_chat/views.py
import os
import json
import traceback
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

# Defensive imports for llama_index / Ollama — don't let missing packages crash the whole app.
try:
    # llama_index API surface has changed across versions; try common imports
    try:
        from llama_index.core import StorageContext, load_index_from_storage
        from llama_index.core.settings import Settings
        from llama_index.llms.ollama import Ollama
        from llama_index.embeddings.ollama import OllamaEmbedding
    except Exception:
        # fallback import paths
        from llama_index import StorageContext, load_index_from_storage
        from llama_index import Settings
        from llama_index.llms.ollama import Ollama
        from llama_index.embeddings.ollama import OllamaEmbedding

    LLM_IMPORT_OK = True
except Exception as e:
    # If llama_index or ollama libs are not installed, we will still run but AI endpoints will say 'not ready'.
    LLM_IMPORT_OK = False
    _import_error = str(e)


# Config
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
CHAT_MODEL = os.environ.get("AI_CHAT_MODEL", "llama3:8b")
EMBEDDING_MODEL = os.environ.get("AI_EMBEDDING_MODEL", "nomic-embed-text")
PERSIST_DIR = os.environ.get("AI_PERSIST_DIR", "./storage")


class CollegeAIChatBot:
    """Encapsulates AI index + query engine. Safe to import even if dependencies missing."""

    def __init__(self):
        self.query_engine = None
        self.ai_ready = False
        if LLM_IMPORT_OK:
            self.setup_ai()
        else:
            # Keep ai_ready False and store message
            self._import_err = _import_error

    def setup_ai(self):
        """Try to load models/index. Returns True if successful, False otherwise."""
        try:
            if not os.path.exists(PERSIST_DIR):
                # storage not built yet
                print("AI setup: storage directory not found:", PERSIST_DIR)
                self.ai_ready = False
                return False

            print("Loading AI models (Ollama host:", OLLAMA_HOST, ") ...")
            # configure llama_index settings to use Ollama
            Settings.llm = Ollama(model=CHAT_MODEL, base_url=OLLAMA_HOST, request_timeout=120.0)
            Settings.embed_model = OllamaEmbedding(model_name=EMBEDDING_MODEL, base_url=OLLAMA_HOST)

            storage_context = StorageContext.from_defaults(persist_dir=PERSIST_DIR)
            index = load_index_from_storage(storage_context)
            # create a query engine (default behavior)
            self.query_engine = index.as_query_engine()
            self.ai_ready = True
            print("✅ AI Chatbot loaded successfully!")
            return True
        except Exception as e:
            # Never raise during import; log and mark not ready
            tb = traceback.format_exc()
            print("❌ AI setup error:", e)
            print(tb)
            self.query_engine = None
            self.ai_ready = False
            self._last_setup_error = tb
            return False

    def get_ai_response(self, user_message):
        """
        Ask the index and return a concise, one-line answer.
        We add explicit brevity instructions in the prompt and also
        post-process the model output to return only the first sentence
        (or first 120 characters) as a fallback.
        """
        if not LLM_IMPORT_OK:
            return "❌ AI libraries not installed on server."

        if not self.query_engine:
            return "🤖 AI is not ready yet. Please ensure the model is trained and Ollama is running."

        try:
            # Strong, explicit system instruction for brevity and style
            brief_prompt = f"""
You are a concise study assistant for a college resources site.
Answer the user's question in ONE SHORT SENTENCE (<= 25 words).
Use simple, direct language. Do NOT add extra explanations, examples, or follow-ups.
If the user says a greeting like "hello", reply with a short greeting only.
User: {user_message}
"""
            response_obj = self.query_engine.query(brief_prompt)
            raw = str(response_obj).strip()

            # Post-process: keep only the first sentence (fallback)
            import re
            sentences = re.split(r'(?<=[.!?])\s+', raw)
            if sentences and len(sentences[0].strip()) > 0:
                concise = sentences[0].strip()
            else:
                concise = (raw[:120] + '...') if len(raw) > 120 else raw

            # Safety crop
            if len(concise) > 200:
                concise = concise[:197].rsplit(' ', 1)[0] + '...'

            return concise
        except Exception as e:
            tb = traceback.format_exc()
            print("❌ Error while querying AI:", e)
            print(tb)
            return f"❌ Error while querying AI: {str(e)}"


# create a single global bot instance (module-level)
ai_bot = CollegeAIChatBot()


@csrf_exempt
def ai_chat_query(request):
    """
    POST /api/ai/query/
    Body: {"message": "your text"}
    Response: {"success": True, "response": "..."} or {"success": False, "error": "..."}
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid method; use POST'}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
        user_message = payload.get('message', '').strip()
        if not user_message:
            return JsonResponse({'success': False, 'error': 'Empty message'}, status=400)

        ai_response = ai_bot.get_ai_response(user_message)
        return JsonResponse({'success': True, 'response': ai_response})
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        tb = traceback.format_exc()
        print("❌ Unexpected error in ai_chat_query:", e)
        print(tb)
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


def ai_status(request):
    """
    GET /api/ai/status/  -> returns readiness info
    """
    # If imports failed, signal that
    if not LLM_IMPORT_OK:
        return JsonResponse({'ai_ready': False, 'model': CHAT_MODEL, 'detail': 'llama_index/ollama libs missing', 'import_error': str(_import_error)})

    return JsonResponse({
        'ai_ready': bool(ai_bot.ai_ready),
        'model': CHAT_MODEL,
        'persist_dir': PERSIST_DIR,
        'ollama_host': OLLAMA_HOST,
        'last_setup_error': getattr(ai_bot, '_last_setup_error', None)
    })
