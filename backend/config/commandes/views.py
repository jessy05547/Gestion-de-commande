import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q
from facture.models import Facture
from ligneCommande.models import LigneCommande
from paiement.models import Paiement
from produit.models import Produit
from .models import Commande, Notification
from .serializers import CommandeSerializer
from .workflow import (
    create_notification,
    issue_supplier_response_token,
    send_supplier_order_email,
    send_supplier_payment_email,
)

logger = logging.getLogger(__name__)


class CommandeViewSet(viewsets.ModelViewSet):
    queryset = (
        Commande.objects
        .select_related('fk_id_fournisseur')
        .prefetch_related('lignes_commandes')
        .all()
        .order_by('-dateCommande', '-id_commande')
    )
    serializer_class = CommandeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset().filter(cree_par=self.request.user)
        search = self.request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(reference__icontains=search)
                | Q(status__icontains=search)
                | Q(fk_id_fournisseur__nomFournisseur__icontains=search)
                | Q(fk_id_fournisseur__prenomFournisseur__icontains=search)
                | Q(fk_id_fournisseur__raisonSociale__icontains=search)
            )
        return queryset

    def perform_create(self, serializer):
        commande = serializer.save(cree_par=self.request.user)
        token = issue_supplier_response_token(commande)
        try:
            sent = send_supplier_order_email(commande, token)
            if sent != 1:
                raise RuntimeError('Brevo n’a pas accepté le message de commande.')
        except Exception:
            logger.exception(
                'Échec de l’envoi de la commande %s à son fournisseur.',
                commande.reference,
            )
            commande.email_status = Commande.EmailStatus.FAILED
            commande.supplier_response_token_hash = ''
            commande.supplier_response_expires_at = None
            commande.save(update_fields=[
                'email_status',
                'supplier_response_token_hash',
                'supplier_response_expires_at',
            ])
        else:
            commande.status = Commande.Status.ENVOYE
            commande.email_status = Commande.EmailStatus.SENT
            commande.save(update_fields=['status', 'email_status'])

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        if response.data.get('email_status') == Commande.EmailStatus.FAILED:
            response.data['email_error'] = (
                'La commande a été enregistrée, mais Brevo n’a pas accepté son envoi. '
                'Vérifiez la configuration e-mail avant de renvoyer la commande.'
            )
        return response

    @action(detail=True, methods=['post'], url_path='resend')
    def resend(self, request, pk=None):
        commande = self.get_object()
        if commande.status != Commande.Status.EN_ATTENTE or commande.email_status != Commande.EmailStatus.FAILED:
            raise ValidationError({'detail': 'Seules les commandes dont l’envoi a échoué peuvent être renvoyées.'})

        token = issue_supplier_response_token(commande)
        try:
            sent = send_supplier_order_email(commande, token)
            if sent != 1:
                raise RuntimeError('Brevo n’a pas accepté le message de commande.')
        except Exception:
            logger.exception('Échec du nouvel envoi de la commande %s.', commande.reference)
            commande.email_status = Commande.EmailStatus.FAILED
            commande.supplier_response_token_hash = ''
            commande.supplier_response_expires_at = None
            commande.save(update_fields=[
                'email_status',
                'supplier_response_token_hash',
                'supplier_response_expires_at',
            ])
            return Response(
                {'detail': 'Brevo n’a pas accepté le message. Vérifiez la configuration e-mail et réessayez.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        commande.status = Commande.Status.ENVOYE
        commande.email_status = Commande.EmailStatus.SENT
        commande.save(update_fields=['status', 'email_status'])
        return Response(self.get_serializer(commande).data)

    @action(detail=True, methods=['post'], url_path='complete-payment')
    def complete_payment(self, request, pk=None):
        mode = request.data.get('mode_paiement')
        allowed_modes = {'Virement', 'Carte bancaire', 'Prélèvement', 'Espèces'}
        if mode not in allowed_modes:
            raise ValidationError({
                'mode_paiement': 'Sélectionnez un mode de paiement valide.',
            })

        with transaction.atomic():
            commande = get_object_or_404(
                Commande.objects.select_for_update().select_related('fk_id_fournisseur', 'cree_par'),
                pk=pk,
                cree_par=request.user,
            )
            if commande.status != Commande.Status.CONFIRME:
                raise ValidationError({'detail': 'Seules les commandes confirmées peuvent être payées.'})
            if Facture.objects.filter(fk_id_commande=commande).exists():
                raise ValidationError({'detail': 'Une facture existe déjà pour cette commande.'})

            lines = list(
                LigneCommande.objects
                .select_related('fk_id_produit')
                .filter(fk_id_commande=commande)
            )
            total = sum(
                (line.quantite * line.prix for line in lines),
                Decimal('0'),
            )
            if total <= 0:
                raise ValidationError({'detail': 'Le montant total de la commande doit être supérieur à zéro.'})

            facture = Facture.objects.create(
                fk_id_commande=commande,
                montant_total=total,
                cree_par=request.user,
            )
            paiement = Paiement.objects.create(
                fk_id_facture=facture,
                montant=total,
                mode_paiement=mode,
                cree_par=request.user,
            )
            for line in lines:
                if line.fk_id_produit_id:
                    Produit.objects.filter(
                        pk=line.fk_id_produit_id,
                        cree_par=request.user,
                    ).update(quantiteStock=F('quantiteStock') + line.quantite)

            commande.status = Commande.Status.LIVREE
            commande.save(update_fields=['status'])
            create_notification(
                request.user,
                Notification.Kind.INVOICE_CREATED,
                f'La facture {facture.reference_facture} de la commande {commande.reference} est disponible.',
                commande=commande,
                facture=facture,
            )
            create_notification(
                request.user,
                Notification.Kind.PAYMENT_COMPLETED,
                f'Le paiement de la commande {commande.reference} a été enregistré.',
                commande=commande,
                facture=facture,
            )

        try:
            sent = send_supplier_payment_email(commande, facture, paiement, total)
            if sent != 1:
                raise RuntimeError('Le fournisseur n’a pas été notifié par Brevo.')
        except Exception:
            logger.exception(
                'Le paiement %s est enregistré, mais le fournisseur n’a pas pu être notifié.',
                paiement.reference_paiement,
            )
            return Response({
                'detail': 'Paiement enregistré et facture créée. L’e-mail au fournisseur n’a pas pu être envoyé.',
                'facture_id': facture.id_facture,
                'paiement_id': paiement.id_paiement,
                'supplier_email_sent': False,
            }, status=status.HTTP_201_CREATED)

        return Response({
            'detail': 'Paiement enregistré, facture créée et fournisseur notifié.',
            'facture_id': facture.id_facture,
            'paiement_id': paiement.id_paiement,
            'supplier_email_sent': True,
        }, status=status.HTTP_201_CREATED)
