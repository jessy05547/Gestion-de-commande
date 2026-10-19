import hmac
import secrets
import smtplib
from datetime import timedelta

from anymail.exceptions import AnymailError
from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import action
from .serializers import (
    RegistrationVerificationSerializer,
    UserRegistrationSerializer,
    UtilisateurSerialize,
)
from .models import PendingRegistration, Utilisateurs
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView


class EmailDeliveryUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'Le service e-mail est indisponible. Réessayez plus tard.'
    default_code = 'email_unavailable'


class IsAdministrator(IsAuthenticated):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and (
            request.user.is_superuser or request.user.role == 'Admin'
        )


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['email'] = user.email
        token['first_name'] = user.prenomUtilisateur
        token['last_name'] = user.nomUtilisateur
        return token


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class UtilisateurViewSet(viewsets.ModelViewSet):
    queryset = Utilisateurs.objects.all()
    serializer_class = UtilisateurSerialize
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in {'register', 'verify_registration'}:
            return [AllowAny()]
        if self.action == 'create' or self.action in {'update', 'partial_update', 'destroy'}:
            return [IsAdministrator()]
        return super().get_permissions()

    def get_authenticators(self):
        if self.action_map.get(self.request.method.lower()) in {'register', 'verify_registration'}:
            return []
        return super().get_authenticators()

    def get_serializer_class(self):
        if self.action == 'register':
            return UserRegistrationSerializer
        return super().get_serializer_class()

    @action(detail=False, methods=['post'], permission_classes=[AllowAny], authentication_classes=[], serializer_class=UserRegistrationSerializer)
    def register(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        registration_data = serializer.validated_data
        email = registration_data['email']
        code = f'{secrets.randbelow(1_000_000):06d}'
        expires_at = timezone.now() + timedelta(minutes=10)
        code_hash = hmac.digest(
            settings.SECRET_KEY.encode(),
            f'{email}:{code}'.encode(),
            'sha256',
        ).hex()

        with transaction.atomic():
            PendingRegistration.objects.update_or_create(
                email=email,
                defaults={
                    'nomUtilisateur': registration_data['nomUtilisateur'],
                    'prenomUtilisateur': registration_data['prenomUtilisateur'],
                    'telephone': registration_data.get('telephone', ''),
                    'password': make_password(registration_data['password']),
                    'code_hash': code_hash,
                    'expires_at': expires_at,
                    'attempts': 0,
                },
            )
            try:
                sent_count = send_mail(
                    subject='Votre code de vérification',
                    message=(
                        f'Votre code de vérification est : {code}\n\n'
                        'Ce code est valable pendant 10 minutes. '
                        'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.'
                    ),
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[email],
                    fail_silently=False,
                )
            except (AnymailError, OSError, smtplib.SMTPException) as error:
                raise EmailDeliveryUnavailable() from error
            if sent_count != 1:
                raise EmailDeliveryUnavailable(
                    'Le code de vérification n’a pas pu être envoyé.'
                )

        return Response(
            {'detail': 'Un code de vérification a été envoyé à votre adresse e-mail.'},
            status=status.HTTP_200_OK,
        )

    @action(
        detail=False,
        methods=['post'],
        permission_classes=[AllowAny],
        authentication_classes=[],
        serializer_class=RegistrationVerificationSerializer,
        url_path='verify-registration',
    )
    def verify_registration(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        code = serializer.validated_data['code']

        with transaction.atomic():
            try:
                pending = PendingRegistration.objects.select_for_update().get(email=email)
            except PendingRegistration.DoesNotExist:
                return Response(
                    {'detail': 'Le code est invalide ou a expiré. Recommencez votre inscription.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if pending.expires_at <= timezone.now():
                pending.delete()
                return Response(
                    {'detail': 'Le code a expiré. Recommencez votre inscription.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            submitted_hash = hmac.digest(
                settings.SECRET_KEY.encode(),
                f'{email}:{code}'.encode(),
                'sha256',
            ).hex()
            if not hmac.compare_digest(pending.code_hash, submitted_hash):
                pending.attempts += 1
                if pending.attempts >= 5:
                    pending.delete()
                else:
                    pending.save(update_fields=['attempts'])
                return Response(
                    {'detail': 'Le code de vérification est incorrect.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user = Utilisateurs(
                email=pending.email,
                nomUtilisateur=pending.nomUtilisateur,
                prenomUtilisateur=pending.prenomUtilisateur,
                telephone=pending.telephone or None,
                password=pending.password,
            )
            user.save()
            pending.delete()

        return Response(
            {'detail': 'Votre adresse e-mail est vérifiée et votre compte a été créé.'},
            status=status.HTTP_201_CREATED,
        )

    def get_queryset(self):
        queryset = Utilisateurs.objects.all().order_by('id_utilisateur')
        if self.request.user.is_superuser or self.request.user.role == 'Admin':
            return queryset
        return queryset.filter(pk=self.request.user.pk)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], permission_classes=[AllowAny], authentication_classes=[])
    def login(self, request):
        serializer = CustomTokenObtainPairSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)
