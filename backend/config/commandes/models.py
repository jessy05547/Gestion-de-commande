from django.db import models
from django.db import router, transaction
from fournisseurs.models import Fournisseur
from django.conf import settings 
from django.utils import timezone
import uuid
# Create your models here.
class Commande(models.Model):
    class EmailStatus(models.TextChoices):
        PENDING = 'pending', 'En attente d’envoi'
        SENT = 'sent', 'Accepté par Brevo'
        FAILED = 'failed', 'Échec de l’envoi'

    class Status(models.TextChoices):
        ENVOYE = 'envoye', 'Envoyée'
        CONFIRME = 'confirme', 'Confirmée'
        ANNULEE = 'annulee', 'Annulée'
        LIVREE = 'livree', 'Livrée'
        EN_ATTENTE = 'en_attente', 'En attente'

    id_commande = models.AutoField(primary_key=True)
    reference = models.CharField(max_length=255, unique=True, null=False, blank=True)
    dateCommande = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.EN_ATTENTE)
    email_status = models.CharField(
        max_length=20,
        choices=EmailStatus.choices,
        default=EmailStatus.PENDING,
    )
    supplier_response_token_hash = models.CharField(max_length=64, blank=True)
    supplier_response_expires_at = models.DateTimeField(null=True, blank=True)
    fk_id_fournisseur = models.ForeignKey('fournisseurs.Fournisseur', on_delete=models.CASCADE, null=False, blank=False, related_name='commandes')
    cree_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self._state.adding or self.reference:
            return super().save(*args, **kwargs)

        using = kwargs.get('using') or router.db_for_write(type(self), instance=self)
        with transaction.atomic(using=using):
            self.reference = f'CMD-TEMP-{uuid.uuid4().hex}'
            super().save(*args, using=using, **{key: value for key, value in kwargs.items() if key != 'using'})

            reference_date = timezone.localdate().strftime('%Y%m%d')
            reference_base = f'CMD-{reference_date}-{self.pk:06d}'
            self.reference = reference_base
            while type(self).objects.using(using).filter(reference=self.reference).exclude(pk=self.pk).exists():
                self.reference = f'{reference_base}-{uuid.uuid4().hex.upper()}'
            super().save(using=using, update_fields=['reference'])

    def __str__(self):
        return f"Commande {self.id_commande} - {self.reference}"


class Notification(models.Model):
    class Kind(models.TextChoices):
        PAYMENT_REQUIRED = 'payment_required', 'Paiement à effectuer'
        SUPPLIER_REFUSED = 'supplier_refused', 'Commande refusée'
        INVOICE_CREATED = 'invoice_created', 'Facture créée'
        PAYMENT_COMPLETED = 'payment_completed', 'Paiement terminé'
        PRODUCT_CREATED = 'product_created', 'Produit ajouté au catalogue'

    id_notification = models.AutoField(primary_key=True)
    utilisateur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    commande = models.ForeignKey(
        Commande,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications',
    )
    facture = models.ForeignKey(
        'facture.Facture',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications',
    )
    kind = models.CharField(max_length=32, choices=Kind.choices)
    message = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-created_at', '-id_notification')

    def __str__(self):
        return self.message