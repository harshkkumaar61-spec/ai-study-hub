from django.apps import AppConfig

class AiChatConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'backend.ai_chat'   # <-- MUST match the package path
