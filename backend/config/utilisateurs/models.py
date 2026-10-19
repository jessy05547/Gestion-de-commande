from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


class UtilisateurManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, nomUtilisateur, prenomUtilisateur, password=None, mot_de_passe=None, **extra_fields):
        if not email:
            raise ValueError("L'email est obligatoire.")
        if not nomUtilisateur:
            raise ValueError('Le nom est obligatoire.')
        if not prenomUtilisateur:
            raise ValueError('Le prénom est obligatoire.')

        email = self.normalize_email(email)
        user = self.model(
            email=email,
            nomUtilisateur=nomUtilisateur,
            prenomUtilisateur=prenomUtilisateur,
            **extra_fields,
        )
        user.set_password(password if password is not None else mot_de_passe)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, nomUtilisateur, prenomUtilisateur, password=None, mot_de_passe=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Le superutilisateur doit avoir is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Le superutilisateur doit avoir is_superuser=True.')

        return self.create_user(
            email,
            nomUtilisateur,
            prenomUtilisateur,
            password=password,
            mot_de_passe=mot_de_passe,
            **extra_fields,
        )


class Utilisateurs(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        ADMIN = 'Admin', 'Administrateur'
        ACHETEUR = 'achateur', 'Acheteur'
        RESPONSABLE_ACHATS = 'responsable', 'Responsable'

    id_utilisateur = models.AutoField(primary_key=True)
    nomUtilisateur = models.CharField(max_length=255, null=False, blank=False)
    prenomUtilisateur = models.CharField(max_length=255, null=False, blank=False)
    email = models.EmailField(unique=True, null=False, blank=False)
    telephone = models.CharField(max_length=20, null=True, blank=True)
    date_joined = models.DateTimeField(auto_now_add=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.ACHETEUR)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['nomUtilisateur', 'prenomUtilisateur']
    objects = UtilisateurManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['nomUtilisateur', 'prenomUtilisateur', 'email'],
                name='unique_utilisateur'
            )
        ]

    def __str__(self):
        return f"{self.nomUtilisateur} {self.prenomUtilisateur}"


class PendingRegistration(models.Model):
    email = models.EmailField(unique=True)
    nomUtilisateur = models.CharField(max_length=255)
    prenomUtilisateur = models.CharField(max_length=255)
    telephone = models.CharField(max_length=20, blank=True)
    password = models.CharField(max_length=128)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    date_creation = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Inscription en attente pour {self.email}"
