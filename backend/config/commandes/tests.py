from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch

from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from commandes.models import Commande, Notification
from facture.models import Facture
from fournisseurs.models import Fournisseur
from ligneCommande.models import LigneCommande
from paiement.models import Paiement
from produit.models import Produit
from utilisateurs.models import Utilisateurs


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class UserDataIsolationTests(APITestCase):
    def create_user(self, email, role=Utilisateurs.Role.ACHETEUR):
        user = Utilisateurs(
            email=email,
            nomUtilisateur=email.split('@')[0],
            prenomUtilisateur='Test',
            role=role,
        )
        user.set_password('Testing-password-123!')
        user.save()
        return user

    def create_supplier(self, owner, email):
        return Fournisseur.objects.create(
            nomFournisseur='Fournisseur',
            prenomFournisseur='Test',
            raisonSociale='Société de test',
            email=email,
            cree_par=owner,
        )

    def setUp(self):
        self.user_a = self.create_user('user-a@example.test')
        self.user_b = self.create_user('user-b@example.test')
        self.supplier_a = self.create_supplier(self.user_a, 'supplier-a@example.test')
        self.supplier_b = self.create_supplier(self.user_b, 'supplier-b@example.test')
        self.product_a = Produit.objects.create(
            nomProduit='Produit A',
            prixUnitaire=Decimal('100.00'),
            quantiteStock=Decimal('8.00'),
            fk_id_fournisseur=self.supplier_a,
            cree_par=self.user_a,
        )
        self.product_b = Produit.objects.create(
            nomProduit='Produit B',
            prixUnitaire=Decimal('50.00'),
            quantiteStock=Decimal('4.00'),
            fk_id_fournisseur=self.supplier_b,
            cree_par=self.user_b,
        )
        self.command_a = Commande.objects.create(
            fk_id_fournisseur=self.supplier_a,
            cree_par=self.user_a,
        )
        self.command_b = Commande.objects.create(
            fk_id_fournisseur=self.supplier_b,
            cree_par=self.user_b,
        )
        self.invoice_a = Facture.objects.create(
            fk_id_commande=self.command_a,
            montant_total=Decimal('100.00'),
            cree_par=self.user_a,
        )
        self.invoice_b = Facture.objects.create(
            fk_id_commande=self.command_b,
            montant_total=Decimal('50.00'),
            cree_par=self.user_b,
        )
        self.payment_a = Paiement.objects.create(
            fk_id_facture=self.invoice_a,
            montant=Decimal('100.00'),
            mode_paiement='Virement',
            cree_par=self.user_a,
        )
        self.payment_b = Paiement.objects.create(
            fk_id_facture=self.invoice_b,
            montant=Decimal('50.00'),
            mode_paiement='Virement',
            cree_par=self.user_b,
        )

    def test_lists_and_user_records_are_scoped_to_owner(self):
        self.client.force_authenticate(self.user_a)
        endpoints = (
            ('/api/fournisseurs/', 'id_fournisseur', self.supplier_a.pk),
            ('/api/produits/', 'id_produit', self.product_a.pk),
            ('/api/commandes/', 'id_commande', self.command_a.pk),
            ('/api/factures/', 'id_facture', self.invoice_a.pk),
            ('/api/paiements/', 'id_paiement', self.payment_a.pk),
            ('/api/utilisateurs/', 'id_utilisateur', self.user_a.pk),
        )
        for url, id_field, own_id in endpoints:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual([row[id_field] for row in response.data], [own_id])

        self.assertEqual(
            self.client.get(f'/api/produits/{self.product_b.pk}/').status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.get(f'/api/commandes/{self.command_b.pk}/').status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_create_assigns_owner_and_rejects_foreign_relations(self):
        self.client.force_authenticate(self.user_a)

        supplier_response = self.client.post('/api/fournisseurs/', {
            'nomFournisseur': 'Nouveau',
            'prenomFournisseur': 'Fournisseur',
            'raisonSociale': 'Nouvelle société',
            'email': 'new-supplier@example.test',
            'cree_par': self.user_b.pk,
        })
        self.assertEqual(supplier_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(supplier_response.data['cree_par'], self.user_a.pk)
        new_supplier_id = supplier_response.data['id_fournisseur']

        product_response = self.client.post('/api/produits/', {
            'nomProduit': 'Nouveau produit',
            'prixUnitaire': '12.50',
            'quantiteStock': '3',
            'fk_id_fournisseur': new_supplier_id,
            'cree_par': self.user_b.pk,
        })
        self.assertEqual(product_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(product_response.data['cree_par'], self.user_a.pk)

        command_response = self.client.post('/api/commandes/', {
            'fk_id_fournisseur': new_supplier_id,
            'status': Commande.Status.EN_ATTENTE,
            'panier': [{'id_produit': product_response.data['id_produit'], 'quantite': '1'}],
        }, format='json')
        self.assertEqual(command_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(command_response.data['cree_par'], self.user_a.pk)

        self.assertFalse(Facture.objects.filter(
            fk_id_commande_id=command_response.data['id_commande'],
        ).exists())
        invoice_response = self.client.post('/api/factures/', {
            'fk_id_commande': command_response.data['id_commande'],
            'montant_total': '12.50',
        })
        self.assertEqual(invoice_response.status_code, status.HTTP_201_CREATED)
        invoice = Facture.objects.get(pk=invoice_response.data['id_facture'])
        self.assertEqual(invoice.cree_par, self.user_a)

        payment_response = self.client.post('/api/paiements/', {
            'fk_id_facture': invoice.pk,
            'montant': '12.50',
            'mode_paiement': 'Virement',
        })
        self.assertEqual(payment_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(payment_response.data['cree_par'], self.user_a.pk)

        foreign_product = self.client.post('/api/produits/', {
            'nomProduit': 'Produit interdit',
            'prixUnitaire': '1.00',
            'quantiteStock': '1',
            'fk_id_fournisseur': self.supplier_b.pk,
        })
        self.assertEqual(foreign_product.status_code, status.HTTP_400_BAD_REQUEST)

        foreign_command = self.client.post('/api/commandes/', {
            'fk_id_fournisseur': self.supplier_b.pk,
            'status': Commande.Status.EN_ATTENTE,
            'panier': [{'id_produit': self.product_a.pk, 'quantite': '1'}],
        }, format='json')
        self.assertEqual(foreign_command.status_code, status.HTTP_400_BAD_REQUEST)

        foreign_invoice = self.client.post('/api/factures/', {
            'fk_id_commande': self.command_b.pk,
            'montant_total': '10.00',
        })
        self.assertEqual(foreign_invoice.status_code, status.HTTP_400_BAD_REQUEST)

        foreign_payment = self.client.post('/api/paiements/', {
            'fk_id_facture': self.invoice_b.pk,
            'montant': '10.00',
            'mode_paiement': 'Virement',
        })
        self.assertEqual(foreign_payment.status_code, status.HTTP_400_BAD_REQUEST)

    def test_order_accepts_catalogue_and_non_catalogue_items(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.post('/api/commandes/', {
            'fk_id_fournisseur': self.supplier_a.pk,
            'status': Commande.Status.EN_ATTENTE,
            'panier': [
                {
                    'id_produit': self.product_a.pk,
                    'prix': '0.01',
                    'quantite': '1',
                },
                {
                    'nom_produit': 'Prestation ponctuelle',
                    'prix': '12.50',
                    'quantite': '3',
                },
            ],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['total'], Decimal('137.50'))
        self.assertFalse(Facture.objects.filter(
            fk_id_commande_id=response.data['id_commande'],
        ).exists())
        self.assertEqual(
            [(line['nom_produit'], line['id_produit']) for line in response.data['lignes']],
            [('Produit A', self.product_a.pk), ('Prestation ponctuelle', None)],
        )
        self.assertEqual(response.data['lignes'][0]['prix'], Decimal('100.00'))

        self.product_a.delete()
        line = response.data['lignes'][0]
        order_line = Commande.objects.get(
            pk=response.data['id_commande'],
        ).lignes_commandes.get(pk=line['id_ligne_commande'])
        self.assertIsNone(order_line.fk_id_produit_id)
        self.assertEqual(order_line.libelle, 'Produit A')

    def test_non_catalogue_item_requires_name_and_price(self):
        self.client.force_authenticate(self.user_a)
        for item in (
            {'quantite': '1'},
            {'nom_produit': 'Prestation ponctuelle', 'quantite': '1'},
        ):
            with self.subTest(item=item):
                response = self.client.post('/api/commandes/', {
                    'fk_id_fournisseur': self.supplier_a.pk,
                    'panier': [item],
                }, format='json')

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('panier', response.data)

    def test_cannot_create_a_second_invoice_for_an_order(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.post('/api/factures/', {
            'fk_id_commande': self.command_a.pk,
            'montant_total': '100.00',
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Une facture existe déjà', str(response.data))

    def test_data_forms_reject_invalid_values(self):
        self.client.force_authenticate(self.user_a)

        blank_supplier = self.client.post('/api/fournisseurs/', {
            'nomFournisseur': ' ',
            'prenomFournisseur': 'Test',
            'raisonSociale': 'Société',
            'email': 'blank-name@example.test',
        })
        self.assertEqual(blank_supplier.status_code, status.HTTP_400_BAD_REQUEST)

        invalid_email = self.client.post('/api/fournisseurs/', {
            'nomFournisseur': 'Test',
            'prenomFournisseur': 'Fournisseur',
            'raisonSociale': 'Société',
            'email': 'not-an-email',
        })
        self.assertEqual(invalid_email.status_code, status.HTTP_400_BAD_REQUEST)

        negative_product = self.client.post('/api/produits/', {
            'nomProduit': 'Produit invalide',
            'prixUnitaire': '-1.00',
            'quantiteStock': '1',
            'fk_id_fournisseur': self.supplier_a.pk,
        })
        self.assertEqual(negative_product.status_code, status.HTTP_400_BAD_REQUEST)

        empty_order = self.client.post('/api/commandes/', {
            'fk_id_fournisseur': self.supplier_a.pk,
            'status': Commande.Status.EN_ATTENTE,
            'panier': [],
        }, format='json')
        self.assertEqual(empty_order.status_code, status.HTTP_400_BAD_REQUEST)

        zero_invoice = self.client.post('/api/factures/', {
            'fk_id_commande': self.command_a.pk,
            'montant_total': '0',
        })
        self.assertEqual(zero_invoice.status_code, status.HTTP_400_BAD_REQUEST)

        invalid_payment = self.client.post('/api/paiements/', {
            'fk_id_facture': self.invoice_a.pk,
            'montant': '-2.00',
            'mode_paiement': 'Cryptomonnaie',
        })
        self.assertEqual(invalid_payment.status_code, status.HTTP_400_BAD_REQUEST)

    def test_administrator_user_form_enforces_password_and_valid_role(self):
        admin = self.create_user('admin@example.test', role=Utilisateurs.Role.ADMIN)
        self.client.force_authenticate(admin)

        invalid_user = self.client.post('/api/utilisateurs/', {
            'nomUtilisateur': 'Nouveau',
            'prenomUtilisateur': 'Compte',
            'email': 'new-user@example.test',
            'password': '123',
            'role': Utilisateurs.Role.ACHETEUR,
        })
        self.assertEqual(invalid_user.status_code, status.HTTP_400_BAD_REQUEST)

        valid_user = self.client.post('/api/utilisateurs/', {
            'nomUtilisateur': 'Nouveau',
            'prenomUtilisateur': 'Compte',
            'email': 'new-user@example.test',
            'password': 'N7!vb34-Catapult-River',
            'role': Utilisateurs.Role.ACHETEUR,
        })
        self.assertEqual(valid_user.status_code, status.HTTP_201_CREATED)
        self.assertEqual(valid_user.data['role'], Utilisateurs.Role.ACHETEUR)

    @patch('commandes.views.send_supplier_order_email', return_value=1)
    def test_order_is_marked_sent_after_brevo_accepts_email(self, send_email):
        self.client.force_authenticate(self.user_a)
        response = self.client.post('/api/commandes/', {
            'fk_id_fournisseur': self.supplier_a.pk,
            'panier': [{
                'id_produit': self.product_a.pk,
                'quantite': '1',
            }],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Commande.objects.get(pk=response.data['id_commande'])
        self.assertEqual(order.status, Commande.Status.ENVOYE)
        self.assertEqual(order.email_status, Commande.EmailStatus.SENT)
        self.assertTrue(order.supplier_response_token_hash)
        send_email.assert_called_once()

    @patch('commandes.views.send_supplier_order_email', side_effect=RuntimeError('Brevo unavailable'))
    def test_failed_brevo_send_keeps_order_pending_and_reports_error(self, send_email):
        self.client.force_authenticate(self.user_a)
        response = self.client.post('/api/commandes/', {
            'fk_id_fournisseur': self.supplier_a.pk,
            'panier': [{
                'id_produit': self.product_a.pk,
                'quantite': '1',
            }],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('email_error', response.data)
        order = Commande.objects.get(pk=response.data['id_commande'])
        self.assertEqual(order.status, Commande.Status.EN_ATTENTE)
        self.assertEqual(order.email_status, Commande.EmailStatus.FAILED)
        self.assertFalse(order.supplier_response_token_hash)
        send_email.assert_called_once()

    def test_supplier_can_confirm_once_and_custom_item_enters_catalogue(self):
        order = Commande.objects.create(
            fk_id_fournisseur=self.supplier_a,
            cree_par=self.user_a,
            status=Commande.Status.ENVOYE,
            email_status=Commande.EmailStatus.SENT,
        )
        LigneCommande.objects.create(
            fk_id_commande=order,
            fk_id_produit=self.product_a,
            libelle=self.product_a.nomProduit,
            quantite=Decimal('2'),
            prix=Decimal('100.00'),
        )
        LigneCommande.objects.create(
            fk_id_commande=order,
            libelle='Article spécial',
            quantite=Decimal('3'),
            prix=Decimal('12.50'),
        )
        from commandes.workflow import issue_supplier_response_token

        token = issue_supplier_response_token(order)
        url = f'/commandes/fournisseur/reponse/{token}/'
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)

        response = self.client.post(url, {'decision': 'confirm'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, Commande.Status.CONFIRME)
        self.assertFalse(order.supplier_response_token_hash)

        custom_product = Produit.objects.get(nomProduit='Article spécial', cree_par=self.user_a)
        self.assertEqual(custom_product.fk_id_fournisseur, self.supplier_a)
        self.assertEqual(custom_product.quantiteStock, Decimal('0'))
        custom_line = order.lignes_commandes.get(libelle='Article spécial')
        self.assertEqual(custom_line.fk_id_produit, custom_product)
        self.assertEqual(
            set(order.notifications.values_list('kind', flat=True)),
            {Notification.Kind.PRODUCT_CREATED, Notification.Kind.PAYMENT_REQUIRED},
        )
        self.assertEqual(self.client.post(url, {'decision': 'confirm'}).status_code, 410)

    def test_supplier_response_link_expires(self):
        order = Commande.objects.create(
            fk_id_fournisseur=self.supplier_a,
            cree_par=self.user_a,
            status=Commande.Status.ENVOYE,
            email_status=Commande.EmailStatus.SENT,
        )
        from commandes.workflow import issue_supplier_response_token

        token = issue_supplier_response_token(order)
        order.supplier_response_expires_at = timezone.now() - timedelta(seconds=1)
        order.save(update_fields=['supplier_response_expires_at'])

        response = self.client.get(f'/commandes/fournisseur/reponse/{token}/')
        self.assertEqual(response.status_code, 410)

    def test_supplier_can_refuse_order_and_owner_is_notified(self):
        order = Commande.objects.create(
            fk_id_fournisseur=self.supplier_a,
            cree_par=self.user_a,
            status=Commande.Status.ENVOYE,
            email_status=Commande.EmailStatus.SENT,
        )
        from commandes.workflow import issue_supplier_response_token

        token = issue_supplier_response_token(order)
        response = self.client.post(
            f'/commandes/fournisseur/reponse/{token}/',
            {'decision': 'refuse'},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, Commande.Status.ANNULEE)
        self.assertEqual(
            order.notifications.get().kind,
            Notification.Kind.SUPPLIER_REFUSED,
        )

    def test_persistent_notifications_are_scoped_to_the_authenticated_user(self):
        from commandes.workflow import create_notification

        notification = create_notification(
            self.user_a,
            Notification.Kind.PAYMENT_REQUIRED,
            'Paiement requis.',
            commande=self.command_a,
        )
        self.client.force_authenticate(self.user_b)

        response = self.client.get('/api/notifications/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])
        self.assertEqual(
            self.client.post(f'/api/notifications/{notification.pk}/mark-read/').status_code,
            status.HTTP_404_NOT_FOUND,
        )

    @patch('commandes.views.send_supplier_payment_email', return_value=1)
    def test_payment_creates_invoice_payment_stock_and_notifications(self, send_email):
        order = Commande.objects.create(
            fk_id_fournisseur=self.supplier_a,
            cree_par=self.user_a,
            status=Commande.Status.CONFIRME,
        )
        LigneCommande.objects.create(
            fk_id_commande=order,
            fk_id_produit=self.product_a,
            libelle=self.product_a.nomProduit,
            quantite=Decimal('2'),
            prix=Decimal('100.00'),
        )
        self.client.force_authenticate(self.user_a)

        response = self.client.post(
            f'/api/commandes/{order.pk}/complete-payment/',
            {'mode_paiement': 'Virement'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        order.refresh_from_db()
        self.product_a.refresh_from_db()
        invoice = Facture.objects.get(fk_id_commande=order)
        payment = Paiement.objects.get(fk_id_facture=invoice)
        self.assertEqual(order.status, Commande.Status.LIVREE)
        self.assertEqual(invoice.montant_total, Decimal('200.00'))
        self.assertEqual(payment.montant, Decimal('200.00'))
        self.assertEqual(self.product_a.quantiteStock, Decimal('10.00'))
        self.assertEqual(order.notifications.count(), 2)
        send_email.assert_called_once()

        duplicate = self.client.post(
            f'/api/commandes/{order.pk}/complete-payment/',
            {'mode_paiement': 'Virement'},
            format='json',
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invoice_download_is_a_pdf_and_scoped_to_owner(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get(f'/api/factures/{self.invoice_a.pk}/download/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(b''.join(response.streaming_content).startswith(b'%PDF'))

        self.client.force_authenticate(self.user_b)
        self.assertEqual(
            self.client.get(f'/api/factures/{self.invoice_a.pk}/download/').status_code,
            status.HTTP_404_NOT_FOUND,
        )

    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='commandes@example.test',
    )
    def test_supplier_payment_email_contains_invoice_pdf_and_reply_to(self):
        from commandes.workflow import send_supplier_payment_email

        sent = send_supplier_payment_email(
            self.command_a,
            self.invoice_a,
            self.payment_a,
            self.invoice_a.montant_total,
        )

        self.assertEqual(sent, 1)
        email = mail.outbox[-1]
        self.assertEqual(email.to, [self.supplier_a.email])
        self.assertEqual(email.reply_to, [self.user_a.email])
        self.assertEqual(len(email.attachments), 1)
        name, content, content_type = email.attachments[0]
        self.assertEqual(name, f'{self.invoice_a.reference_facture}.pdf')
        self.assertEqual(content_type, 'application/pdf')
        self.assertTrue(content.startswith(b'%PDF'))
