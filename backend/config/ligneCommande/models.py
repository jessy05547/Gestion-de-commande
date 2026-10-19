from django.db import models
from commandes.models import Commande
from produit.models import Produit
# Create your models here.
class LigneCommande(models.Model):
    id_ligne_commande = models.AutoField(primary_key=True)
    fk_id_commande = models.ForeignKey('commandes.Commande', on_delete=models.CASCADE, null=False, blank=False, related_name='lignes_commandes')
    fk_id_produit = models.ForeignKey('produit.Produit', on_delete=models.SET_NULL, null=True, blank=True, related_name='lignes_commandes')
    libelle = models.CharField(max_length=255)
    quantite = models.DecimalField(max_digits=10, decimal_places=2, null=False, blank=False)
    prix = models.DecimalField(max_digits=10, decimal_places=2, null=False, blank=False)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"LigneCommande {self.id_ligne_commande} - Commande {self.fk_id_commande.id_commande} - {self.libelle}"