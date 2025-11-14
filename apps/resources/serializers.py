# apps/resources/serializers.py
import os
from rest_framework import serializers
from .models import Resource, Subject

class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'name', 'branch', 'semester']

class ResourceSerializer(serializers.ModelSerializer):
    # nested representation for reads
    subject = SubjectSerializer(read_only=True)

    # write-only field used during create/update to accept a subject id
    subject_id = serializers.PrimaryKeyRelatedField(
        source='subject', queryset=Subject.objects.all(), write_only=True, required=True
    )

    uploaded_by = serializers.StringRelatedField(read_only=True)

    # Return filename safely (avoids CharField(source=...) conflict)
    filename = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Resource
        fields = [
            'id',
            'title',
            'subject',       # nested read-only subject object
            'subject_id',    # write-only field: supply subject id when creating
            'resource_type',
            'pdf_file',
            'filename',
            'uploaded_by',
            'uploaded_at',
            'is_approved',
        ]

    def get_filename(self, obj):
        # Return the base filename or None if no file
        try:
            if not obj.pdf_file:
                return None
            # If using FileField, obj.pdf_file.name gives the relative path
            return os.path.basename(obj.pdf_file.name)
        except Exception:
            return None
