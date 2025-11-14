# apps/ai_chat/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('query/', views.ai_chat_query, name='ai_chat_query'),
    path('status/', views.ai_status, name='ai_status'),
]
