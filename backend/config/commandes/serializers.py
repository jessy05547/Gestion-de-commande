from decimal import Decimal
from rest_framework import serializers
from django.db import transaction
from fournisseurs.models import Fournisseur
from ligneCommande.models import LigneCommande
from produit.models import Produit
from .models import Commande


class CommandeLineInputSerializer(serializers.Serializer):
    id_produit = serializers.PrimaryKeyRelatedField(
        queryset=Produit.objects.all(),
        required=False,
        allow_null=True,
    )
    nom_produit = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=False,
        trim_whitespace=True,
    )
    prix = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal('0'),
        required=False,
    )
    quantite = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))

    def validate(self, attrs):
        product = attrs.get('id_produit')
        if product:
            attrs['nom_produit'] = product.nomProduit
            attrs['prix'] = product.prixUnitaire
            return attrs

        if not attrs.get('nom_produit'):
            raise serializers.ValidationError({
                'nom_produit': 'Le nom de l’article hors catalogue est obligatoire.',
            })
        if 'prix' not in attrs:
            raise serializers.ValidationError({
                'prix': 'Le prix unitaire de l’article hors catalogue est obligatoire.',
            })
        return attrs


class CommandeSerializer(serializers.ModelSerializer):
    panier = CommandeLineInputSerializer(many=True, write_only=True, required=True)
    lignes = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    reference = serializers.CharField(read_only=True, required=False)

    class Meta:
        model = Commande
        fields = '__all__'
        read_only_fields = (
            'reference',
            'cree_par',
            'status',
            'email_status',
            'supplier_response_token_hash',
            'supplier_response_expires_at',
        )

    def get_fields(self):
        fields = super().get_fields()
        fields.pop('supplier_response_token_hash', None)
        fields.pop('supplier_response_expires_at', None)
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            fields['fk_id_fournisseur'].queryset = Fournisseur.objects.filter(cree_par=request.user)
            fields['panier'].child.fields['id_produit'].queryset = Produit.objects.filter(cree_par=request.user)
        return fields

    def get_total(self, commande):
        return sum(
            (ligne.quantite * ligne.prix for ligne in commande.lignes_commandes.all()),
            Decimal('0'),
        )

    def get_lignes(self, commande):
        return [
            {
                'id_ligne_commande': ligne.id_ligne_commande,
                'id_produit': ligne.fk_id_produit_id,
                'nom_produit': ligne.libelle,
                'quantite': ligne.quantite,
                'prix': ligne.prix,
            }
            for ligne in commande.lignes_commandes.all()
        ]

    def validate_panier(self, panier):
        if not panier:
            raise serializers.ValidationError('Ajoutez au moins un produit à la commande.')
        return panier

    def validate(self, attrs):
        attrs = super().validate(attrs)
        status_value = attrs.get('status')
        if status_value and status_value not in Commande.Status.values:
            raise serializers.ValidationError({'status': 'Sélectionnez un statut de commande valide.'})
        supplier = attrs.get('fk_id_fournisseur')
        if supplier:
            for line in attrs.get('panier', []):
                product = line.get('id_produit')
                if product and product.fk_id_fournisseur_id != supplier.pk:
                    raise serializers.ValidationError({
                        'panier': 'Chaque produit du catalogue doit être associé au fournisseur de la commande.',
                    })
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        panier = validated_data.pop('panier', [])
        commande = Commande.objects.create(**validated_data)
        LigneCommande.objects.bulk_create([
            LigneCommande(
                fk_id_commande=commande,
                fk_id_produit=line.get('id_produit'),
                libelle=line['nom_produit'],
                quantite=line['quantite'],
                prix=line['prix'],
            )
            for line in panier
        ])
        return commande
