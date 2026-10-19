from rest_framework import serializers
from .models import Utilisateurs
from django.contrib.auth.password_validation import validate_password


class UserRegistrationSerializer(serializers.Serializer):
    nomUtilisateur = serializers.CharField(max_length=255)
    prenomUtilisateur = serializers.CharField(max_length=255)
    email = serializers.EmailField(max_length=254)
    telephone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, validators=[validate_password])


    def validate_nomUtilisateur(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Le nom ne peut pas être vide.')
        return value

    def validate_prenomUtilisateur(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Le prénom ne peut pas être vide.')
        return value

    def validate_email(self, value):
        email = value.strip().lower()
        if Utilisateurs.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError('Un compte existe déjà avec cette adresse e-mail.')
        return email


class RegistrationVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    code = serializers.RegexField(r'^\d{6}$')

    def validate_email(self, value):
        return value.strip().lower()


class UtilisateurSerialize(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    class Meta:
        model = Utilisateurs
        fields = '__all__'
        read_only_fields = [
            'id_utilisateur',
            'groups',
            'user_permissions',
            'last_login',
            'is_superuser',
            'is_staff',
            'is_active',
            'date_joined',
            'date_creation',
            'date_modification',
        ]
        
    def create_user(self, validated_data):
        return Utilisateurs.objects.create_user(**validated_data)
    
    def create(self, validated_data):
        return self.create_user(validated_data)
    
    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            if attr == 'password':
                instance.set_password(value)
            else:
                setattr(instance, attr, value)
        instance.save()
        return instance

    def validate_nomUtilisateur(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Le nom ne peut pas être vide.')
        return value

    def validate_prenomUtilisateur(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Le prénom ne peut pas être vide.')
        return value

    def validate_email(self, value):
        return value.strip().lower()

    def validate_password(self, value):
        if not self.instance and not value:
            raise serializers.ValidationError('Le mot de passe est obligatoire.')
        if value:
            validate_password(value, self.instance)
        return value