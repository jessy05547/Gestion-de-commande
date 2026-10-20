import hashlib
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape
from django.urls import reverse
from django.utils import timezone

logger = logging.getLogger(__name__)


def issue_supplier_response_token(commande):
    token = secrets.token_urlsafe(32)
    commande.supplier_response_token_hash = hashlib.sha256(token.encode()).hexdigest()
    commande.supplier_response_expires_at = timezone.now() + timedelta(days=7)
    commande.save(update_fields=[
        'supplier_response_token_hash',
        'supplier_response_expires_at',
    ])
    return token


def send_supplier_order_email(commande, token):
    response_url = f'{settings.PUBLIC_APP_URL}{reverse("supplier-order-response", args=[token])}'
    lines = list(commande.lignes_commandes.all())
    item_text = '\n'.join(
        f'- {line.libelle} — {line.quantite} x {line.prix}'
        for line in lines
    )
    item_html = ''.join(
        f'<tr><td>{escape(line.libelle)}</td><td>{escape(str(line.quantite))}</td>'
        f'<td>{escape(str(line.prix))}</td></tr>'
        for line in lines
    )
    supplier = commande.fk_id_fournisseur
    user = commande.cree_par
    total = sum((line.quantite * line.prix for line in lines), start=0)
    subject = f'Nouvelle commande {commande.reference}'
    text_body = (
        f'Bonjour {supplier.prenomFournisseur} {supplier.nomFournisseur},\n\n'
        f'{user.prenomUtilisateur} {user.nomUtilisateur} vous adresse la commande '
        f'{commande.reference}.\n\n{item_text}\n\n'
        f'Total : {total}\n\n'
        f'Consulter la demande et répondre : {response_url}\n'
        'Ce lien est personnel et expire dans 7 jours.'
    )
    safe_supplier_name = escape(f'{supplier.prenomFournisseur} {supplier.nomFournisseur}')
    safe_user_name = escape(f'{user.prenomUtilisateur} {user.nomUtilisateur}')
    safe_reference = escape(commande.reference)
    safe_total = escape(str(total))
    html_body = f"""
        <p>Bonjour {safe_supplier_name},</p>
        <p>{safe_user_name} vous adresse la commande <strong>{safe_reference}</strong>.</p>
        <table border="1" cellpadding="8" cellspacing="0">
          <thead><tr><th>Article</th><th>Quantité</th><th>Prix unitaire</th></tr></thead>
          <tbody>{item_html}</tbody>
        </table>
        <p><strong>Total : {safe_total}</strong></p>
        <p><a href="{response_url}">Consulter la commande et choisir valider ou refuser</a></p>
        <p>Ce lien sécurisé est à usage unique et expire dans 7 jours.</p>
    """
    email = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[supplier.email],
        reply_to=[user.email],
    )
    email.attach_alternative(html_body, 'text/html')
    return email.send(fail_silently=False)


def send_supplier_payment_email(commande, facture, paiement, total):
    from facture.pdf import render_invoice_pdf

    user = commande.cree_par
    email = EmailMultiAlternatives(
        subject=f'Commande {commande.reference} payée',
        body=(
            f'Bonjour {commande.fk_id_fournisseur.prenomFournisseur} '
            f'{commande.fk_id_fournisseur.nomFournisseur},\n\n'
            f'Le paiement de la commande {commande.reference} a été enregistré.\n'
            f'Montant : {total}\n'
            f'Mode de paiement : {paiement.mode_paiement}\n'
            f'Facture : {facture.reference_facture}\n'
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[commande.fk_id_fournisseur.email],
        reply_to=[user.email],
    )
    email.attach(
        f'{facture.reference_facture}.pdf',
        render_invoice_pdf(facture).getvalue(),
        'application/pdf',
    )
    return email.send(fail_silently=False)


def create_notification(user, kind, message, commande=None, facture=None):
    from .models import Notification

    return Notification.objects.create(
        utilisateur=user,
        kind=kind,
        message=message,
        commande=commande,
        facture=facture,
    )
