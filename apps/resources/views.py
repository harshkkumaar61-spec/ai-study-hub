# apps/resources/views.py
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from .models import Resource, Subject
from .serializers import ResourceSerializer, SubjectSerializer
import traceback
import sys
import logging

logger = logging.getLogger(__name__)

class SubjectViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    permission_classes = [permissions.AllowAny]

class ResourceViewSet(viewsets.ModelViewSet):
    """
    DEBUG PATCH: wraps list() and perform_create() with try/except to show helpful error info.
    Remove debug code after fixing the underlying issue.
    """
    queryset = Resource.objects.all()
    serializer_class = ResourceSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            permission_classes = [permissions.AllowAny]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    # debug-safe list
    def list(self, request, *args, **kwargs):
        try:
            return super().list(request, *args, **kwargs)
        except Exception as e:
            # Log full traceback to server console
            tb = traceback.format_exc()
            logger.error("Error in ResourceViewSet.list(): %s\n%s", str(e), tb)
            print("DEBUG Resource list error:", str(e), file=sys.stderr)
            print(tb, file=sys.stderr)
            # Return JSON with error details (only for debugging, remove later)
            return Response({
                "detail": "Server error while loading resources (debug info below).",
                "error": str(e),
                "traceback": tb.splitlines()[-10:]  # last 10 lines for brevity
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def perform_create(self, serializer):
        try:
            serializer.save(uploaded_by=self.request.user, is_approved=True)
        except Exception as e:
            tb = traceback.format_exc()
            logger.error("Error in ResourceViewSet.perform_create(): %s\n%s", str(e), tb)
            print("DEBUG Resource create error:", str(e), file=sys.stderr)
            print(tb, file=sys.stderr)
            raise
