from rest_framework import status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.mail import send_mail
from django.conf import settings
from django.shortcuts import get_object_or_404
from .models import CustomUser
from .serializers import (
    UserCreateSerializer, 
    MyTokenObtainPairSerializer, 
    UserProfileSerializer,
    UserUpdateSerializer,
    ContactFormSerializer
)

# --- REFRESH FIX KE LIYE VIEW ---
class UserProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated] 

    def get(self, request, *args, **kwargs):
        serializer = UserProfileSerializer(request.user, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

# --- Profile Update ke liye ---
class UserProfileUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def patch(self, request, *args, **kwargs):
        user = request.user
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        
        if serializer.is_valid():
            serializer.save()
            updated_data = UserProfileSerializer(user, context={'request': request}).data
            return Response(updated_data, status=status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# --- Register View (Email Verification ke saath) ---
class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = UserCreateSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data)
        
        if serializer.is_valid():
            user = serializer.save() 
            
            try:
                # IMPORTANT: Yahaan 'frontend_url' ko Vercel URL se badalna hoga
                frontend_url = "https://your-frontend.vercel.app"# <-- AAPKA VERCEL URL
                verification_link = f"{frontend_url}/?verify_token={user.verification_token}"
                
                subject = 'Activate your AI Study Hub Account'
                message = f"""
                Hi {user.first_name},
                Thank you for registering at AI Study Hub!
                Please click the link below to activate your account:
                
                {verification_link}
                
                Thanks,
                The AI Study Hub Team
                """
                
                send_mail(
                    subject,
                    message,
                    settings.DEFAULT_FROM_EMAIL,
                    [user.email]
                )
            except Exception as e:
                print(f"User verification email bhejte waqt error: {e}")
                user.delete()
                return Response(
                    {"error": "Could not send verification email. Please try again."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            try:
                admin_subject = f'New User Registration: {user.email}'
                admin_message = f"""
                A new user has registered on the website:
                Email: {user.email}
                First Name: {user.first_name}
                Last Name: {user.last_name}
                The user needs to verify their email address.
                """
                send_mail(
                    admin_subject,
                    admin_message,
                    settings.DEFAULT_FROM_EMAIL,
                    ['hk015609@gmail.com'] # <-- YAHAN APNA ADMIN EMAIL DAALO
                )
            except Exception as e:
                print(f"Admin notification email bhejte waqt error: {e}")
            
            return Response(
                {"message": "Registration successful! Please check your email to verify your account."}, 
                status=status.HTTP_201_CREATED
            )
            
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# --- Verification link ke liye ---
class VerifyEmailView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        token = request.data.get('token')
        
        if not token:
            return Response({"error": "Token is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = get_object_or_404(CustomUser, verification_token=token)
            
            if user.is_active:
                return Response({"message": "Account already activated. Please login."}, status=status.HTTP_200_OK)
                
            user.is_active = True
            user.save()
            
            return Response(
                {"message": "Account activated successfully! You can now login."},
                status=status.HTTP_200_OK
            )
            
        except CustomUser.DoesNotExist:
             return Response({"error": "Invalid or expired token."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# --- Login View (Update karo taaki inactive user login na kar paaye) ---
class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer
    
    def post(self, request, *args, **kwargs):
        email = request.data.get('email')
        user = None # <-- User variable yahan initialize kiya
        try:
            user = CustomUser.objects.get(email=email)
            if not user.is_active:
                return Response(
                    {"detail": "Account not activated. Please check your email for verification link."},
                    status=status.HTTP_401_UNAUTHORIZED
                )
        except CustomUser.DoesNotExist:
            pass
            
        # Pehle login attempt karo
        response = super().post(request, *args, **kwargs)
        
        # --- NAYA CODE (LOGIN NOTIFICATION KE LIYE) ---
        if response.status_code == 200 and user: # <-- user variable available hai
            try:
                # AB HUM 'user' OBJECT KO USE KARENGE (self.user nahi)
                admin_subject = f'User Logged In: {user.email}'
                admin_message = f"""
                A user just logged in:
                Email: {user.email}
                Name: {user.first_name} {user.last_name}
                """
                send_mail(
                    admin_subject,
                    admin_message,
                    settings.DEFAULT_FROM_EMAIL,
                    ['hk015609@gmail.com'] # <-- Aapka Admin Email
                )
            except Exception as e:
                # Agar email fail ho toh bhi login rokna nahi hai
                print(f"Admin login notification email bhejte waqt error: {e}")
        # --- YAHAN TAK ---
            
        return response

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

# --- Contact Form View ---
class ContactFormView(APIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = ContactFormSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data)
        
        if serializer.is_valid():
            name = serializer.validated_data['name']
            email = serializer.validated_data['email']
            subject = serializer.validated_data['subject']
            message = serializer.validated_data['message']
            
            full_message = f"FROM: {name} <{email}>\n\nSUBJECT: {subject}\n\nMESSAGE:\n{message}"
            
            try:
                send_mail(
                    f'New Contact Form Message: {subject}', 
                    full_message, 
                    settings.DEFAULT_FROM_EMAIL,
                    ['hk015609@gmail.com'] # <-- YAHAN APNA ADMIN EMAIL DAALO
                )
                return Response(
                    {"message": "Thank you for your message! We'll get back to you soon."},
                    status=status.HTTP_200_OK
                )
            except Exception as e:
                print(f"Email bhejte waqt error: {e}")
                return Response(
                    {"error": "Could not send message. Please try again later."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
                
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)