from django.http import FileResponse
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from .models import Facture
from .pdf import render_invoice_pdf
from .serializers import FactureSerializer


class FactureViewSet(viewsets.ModelViewSet):
    queryset = Facture.objects.all().order_by('id_facture')
    serializer_class = FactureSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return super().get_queryset().filter(cree_par=self.request.user)

    def perform_create(self, serializer):
        serializer.save(cree_par=self.request.user)

    @action(detail=True, methods=['get'], url_path='download')
    def download(self, request, pk=None):
        facture = self.get_object()
        filename = f'{facture.reference_facture}.pdf'
        return FileResponse(
            render_invoice_pdf(facture),
            as_attachment=True,
            filename=filename,
            content_type='application/pdf',
        )
