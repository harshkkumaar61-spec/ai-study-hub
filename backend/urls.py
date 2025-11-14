# backend/urls.py (edit this file)
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),

    # API URLs
    path('api/auth/', include('accounts.urls')),
    path('api/resources/', include('resources.urls')),
    path('api/ai/', include('backend.ai_chat.urls')),  # <-- CHANGE made here
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
