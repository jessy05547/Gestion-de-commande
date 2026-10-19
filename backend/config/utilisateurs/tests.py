import re
from datetime import timedelta
from unittest.mock import patch

from anymail.exceptions import AnymailError
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import PendingRegistration


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class UserRegistrationTests(APITestCase):
    registration_url = '/api/utilisateurs/register/'
    verification_url = '/api/utilisateurs/verify-registration/'
    users_url = '/api/utilisateurs/'

    def request_registration(self, email='alex@example.com'):
        return self.client.post(
            self.registration_url,
            {
                'nomUtilisateur': 'Dupont',
                'prenomUtilisateur': 'Alex',
                'email': email,
                'password': 'secure-pass-123',
            },
            format='json',
        )

    def email_code(self):
        return re.search(r'\b\d{6}\b', mail.outbox[-1].body).group()

    def verify_registration(self, email='alex@example.com', code=None):
        if code is None:
            code = self.email_code()
        return self.client.post(
            self.verification_url,
            {'email': email, 'code': code},
            format='json',
        )

    def test_registration_requires_email_verification_before_creating_user(self):
        response = self.client.post(
            self.registration_url,
            {
                'nomUtilisateur': 'Dupont',
                'prenomUtilisateur': 'Alex',
                'email': 'alex@example.com',
                'password': 'secure-pass-123',
                'role': 'Admin',
                'is_staff': True,
                'is_superuser': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(get_user_model().objects.filter(email='alex@example.com').exists())
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('alex@example.com', mail.outbox[0].to)
        self.assertEqual(self.verify_registration().status_code, status.HTTP_201_CREATED)

        user = get_user_model().objects.get(email='alex@example.com')
        self.assertTrue(user.check_password('secure-pass-123'))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(user.role, get_user_model().Role.ACHETEUR)
        self.assertFalse(PendingRegistration.objects.filter(email='alex@example.com').exists())

    def test_registered_user_can_log_in_after_verification(self):
        self.assertEqual(self.request_registration().status_code, status.HTTP_200_OK)
        self.assertEqual(self.verify_registration().status_code, status.HTTP_201_CREATED)

        response = self.client.post(
            '/api/token/',
            {'email': 'alex@example.com', 'password': 'secure-pass-123'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_incorrect_code_does_not_create_an_account(self):
        self.request_registration()
        valid_code = self.email_code()
        incorrect_code = f'{(int(valid_code) + 1) % 1_000_000:06d}'

        response = self.verify_registration(code=incorrect_code)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(get_user_model().objects.filter(email='alex@example.com').exists())
        self.assertTrue(PendingRegistration.objects.filter(email='alex@example.com').exists())

    def test_expired_code_is_rejected_and_pending_registration_is_removed(self):
        self.request_registration()
        PendingRegistration.objects.filter(email='alex@example.com').update(
            expires_at=timezone.now() - timedelta(seconds=1),
        )

        response = self.verify_registration()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PendingRegistration.objects.filter(email='alex@example.com').exists())
        self.assertFalse(get_user_model().objects.filter(email='alex@example.com').exists())

    def test_registration_code_is_limited_to_five_attempts(self):
        self.request_registration()
        valid_code = self.email_code()
        incorrect_code = f'{(int(valid_code) + 1) % 1_000_000:06d}'

        for _ in range(5):
            response = self.verify_registration(code=incorrect_code)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertFalse(PendingRegistration.objects.filter(email='alex@example.com').exists())
        self.assertFalse(get_user_model().objects.filter(email='alex@example.com').exists())

    def test_anonymous_user_cannot_list_users(self):
        response = self.client.get(self.users_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch(
        'utilisateurs.views.send_mail',
        side_effect=AnymailError('Brevo API unavailable'),
    )
    def test_brevo_api_error_returns_service_unavailable(self, send_mail):
        response = self.request_registration()

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        send_mail.assert_called_once()
