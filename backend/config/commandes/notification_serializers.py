from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    commande_id = serializers.IntegerField(read_only=True)
    facture_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Notification
        fields = (
            'id_notification',
            'kind',
            'message',
            'created_at',
            'read_at',
            'commande_id',
            'facture_id',
        )
        read_only_fields = fields
