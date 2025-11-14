# backend/settings.py
"""
Django settings for backend project.
"""
import os
import dj_database_url
import sys
from pathlib import Path
from datetime import timedelta

# BASE_DIR set correctly
BASE_DIR = Path(__file__).resolve().parent.parent

# add apps folder to python path (project structure ke hisaab se)
sys.path.append(str(BASE_DIR / 'apps'))

SECRET_KEY = 'django-insecure-gnji_y%1(dlb)&(6i=)&n%j*^0^m3#_vtv2h_nraf6n$u^g6yc'
DEBUG = True

ALLOWED_HOSTS = [
    'localhost',
    '127.0.0.1',
    '.ngrok-free.app',
    'ungregariously-unbangled-braxton.ngrok-free.dev'
    "your-backend.onrender.com",
    "your-frontend.vercel.app"
]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',

    'accounts',
    'resources',
    'backend.ai_chat',   # <-- changed from 'ai_chat' to 'backend.ai_chat'
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'backend.wsgi.application'

# Database (MySQL) — ensure credentials match your local MySQL
DATABASES = {
    'default': dj_database_url.config(
        # Render apne aap 'DATABASE_URL' environment variable de dega
        # agar aapne database ko service se connect kiya hai
        default=os.environ.get('DATABASE_URL'),
        conn_max_age=600
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_ROOT = BASE_DIR / "staticfiles"
STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
AUTH_USER_MODEL = 'accounts.CustomUser'

CORS_ALLOWED_ORIGINS = [
    "https://ai-study-hub-delta.vercel.app",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost",
    "http://127.0.0.1",
    "https://your-frontend.vercel.app"
]
CORS_ALLOW_ALL_ORIGINS = True

CSRF_TRUSTED_ORIGINS = [
    "https://ungregariously-unbangled-braxton.ngrok-free.dev",
    "https://*.ngrok-free.app"
    "https://your-frontend.vercel.app",
    "https://your-backend.onrender.com"
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
}

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Email (if you use verification etc.)
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'hk015609@gmail.com'
EMAIL_HOST_PASSWORD = 'wgdy tejb ovdz nwix'
DEFAULT_FROM_EMAIL = EMAIL_HOST_USER
