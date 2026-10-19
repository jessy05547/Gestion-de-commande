from rest_framework import serializers
from commandes.models import Commande
from .models import Facture


class FactureSerializer(serializers.ModelSerializer):
    reference_facture = serializers.CharField(read_only=True, required=False)

    class Meta:
        model = Facture
        fields = '__all__'
        read_only_fields = ('reference_facture', 'cree_par')

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            fields['fk_id_commande'].queryset = Commande.objects.filter(cree_par=request.user)
        return fields

    def validate_montant_total(self, value):
        if value <= 0:
            raise serializers.ValidationError('Le montant doit être supérieur à zéro.')
        return value

    def validate_fk_id_commande(self, commande):
        factures = commande.factures.all()
        if self.instance:
            factures = factures.exclude(pk=self.instance.pk)
        if factures.exists():
            raise serializers.ValidationError('Une facture existe déjà pour cette commande.')
        return commande
