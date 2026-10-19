from decimal import Decimal

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from commandes.models import Commande
from facture.models import Facture
from fournisseurs.models import Fournisseur
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

        invoice = Facture.objects.get(fk_id_commande_id=command_response.data['id_commande'])
        self.assertEqual(invoice.montant_total, Decimal('12.50'))
        self.assertEqual(invoice.cree_par, self.user_a)
        invoice_response = self.client.get('/api/factures/')
        self.assertEqual(invoice_response.status_code, status.HTTP_200_OK)
        invoice_data = next(
            row for row in invoice_response.data
            if row['id_facture'] == invoice.pk
        )
        self.assertEqual(invoice_data['cree_par'], self.user_a.pk)

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
        invoice = Facture.objects.get(fk_id_commande_id=response.data['id_commande'])
        self.assertEqual(invoice.montant_total, Decimal('137.50'))
        self.assertEqual(invoice.cree_par, self.user_a)
        self.assertEqual(
            [(line['nom_produit'], line['id_produit']) for line in response.data['lignes']],
            [('Produit A', self.product_a.pk), ('Prestation ponctuelle', None)],
        )
        self.assertEqual(response.data['lignes'][0]['prix'], Decimal('100.00'))

        self.product_a.delete()
        order = Commande.objects.get(pk=response.data['id_commande'])
        catalog_line = order.lignes_commandes.get(libelle='Produit A')
        self.assertIsNone(catalog_line.fk_id_produit_id)
        self.assertEqual(catalog_line.prix, Decimal('100.00'))

    def test_non_catalogue_order_item_requires_name_and_price(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.post('/api/commandes/', {
            'fk_id_fournisseur': self.supplier_a.pk,
            'panier': [{'quantite': '1'}],
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
