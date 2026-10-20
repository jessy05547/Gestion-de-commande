import hashlib

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ligneCommande.models import LigneCommande
from produit.models import Produit

from .models import Commande, Notification
from .workflow import create_notification


def _get_pending_order(token):
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return (
        Commande.objects
        .select_related('fk_id_fournisseur', 'cree_par')
        .prefetch_related('lignes_commandes')
        .filter(
            supplier_response_token_hash=token_hash,
            supplier_response_expires_at__gt=timezone.now(),
            status=Commande.Status.ENVOYE,
        )
        .first()
    )


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def supplier_order_response(request, token):
    order = _get_pending_order(token)
    if order is None:
        return render(
            request,
            'commandes/supplier_response.html',
            {'expired': True},
            status=410,
        )

    if request.method == 'GET':
        return render(
            request,
            'commandes/supplier_response.html',
            {'order': order, 'lines': order.lignes_commandes.all()},
        )

    decision = request.POST.get('decision')
    if decision not in {'confirm', 'refuse'}:
        return HttpResponse('Action invalide.', status=400)

    with transaction.atomic():
        order = (
            Commande.objects
            .select_for_update()
            .select_related('fk_id_fournisseur', 'cree_par')
            .filter(
                supplier_response_token_hash=hashlib.sha256(token.encode()).hexdigest(),
                supplier_response_expires_at__gt=timezone.now(),
                status=Commande.Status.ENVOYE,
            )
            .first()
        )
        if order is None:
            return render(
                request,
                'commandes/supplier_response.html',
                {'expired': True},
                status=410,
            )

        order.supplier_response_token_hash = ''
        order.supplier_response_expires_at = None
        if decision == 'confirm':
            order.status = Commande.Status.CONFIRME
            order.save(update_fields=[
                'status',
                'supplier_response_token_hash',
                'supplier_response_expires_at',
            ])
            for line in order.lignes_commandes.select_related('fk_id_produit'):
                if line.fk_id_produit_id is None:
                    product = Produit.objects.create(
                        nomProduit=line.libelle,
                        description=f'Ajouté depuis la commande {order.reference}.',
                        prixUnitaire=line.prix,
                        quantiteStock=0,
                        fk_id_fournisseur=order.fk_id_fournisseur,
                        cree_par=order.cree_par,
                    )
                    line.fk_id_produit = product
                    line.save(update_fields=['fk_id_produit'])
                    create_notification(
                        order.cree_par,
                        Notification.Kind.PRODUCT_CREATED,
                        f'« {product.nomProduit} » a été ajouté au catalogue (stock initial : 0).',
                        commande=order,
                    )
            create_notification(
                order.cree_par,
                Notification.Kind.PAYMENT_REQUIRED,
                f'La commande {order.reference} est confirmée. Enregistrez le paiement pour terminer le processus.',
                commande=order,
            )
        else:
            order.status = Commande.Status.ANNULEE
            order.save(update_fields=[
                'status',
                'supplier_response_token_hash',
                'supplier_response_expires_at',
            ])
            create_notification(
                order.cree_par,
                Notification.Kind.SUPPLIER_REFUSED,
                f'Le fournisseur a refusé la commande {order.reference}.',
                commande=order,
            )

    return render(
        request,
        'commandes/supplier_response.html',
        {'completed': True, 'decision': decision},
    )
