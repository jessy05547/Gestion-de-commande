from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def render_invoice_pdf(facture):
    commande = facture.fk_id_commande
    supplier = commande.fk_id_fournisseur
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=f'Facture {facture.reference_facture}',
    )
    styles = getSampleStyleSheet()
    elements = [
        Paragraph('FACTURE', styles['Title']),
        Spacer(1, 8 * mm),
        Paragraph(f'<b>Référence :</b> {escape(facture.reference_facture)}', styles['Normal']),
        Paragraph(f'<b>Commande :</b> {escape(commande.reference)}', styles['Normal']),
        Paragraph(f'<b>Date :</b> {facture.date_facture:%d/%m/%Y}', styles['Normal']),
        Paragraph(
            f'<b>Fournisseur :</b> {escape(supplier.prenomFournisseur)} '
            f'{escape(supplier.nomFournisseur)} — {escape(supplier.raisonSociale)}',
            styles['Normal'],
        ),
        Spacer(1, 8 * mm),
    ]
    table_data = [['Article', 'Quantité', 'Prix unitaire', 'Total']]
    table_data.extend([
        [
            Paragraph(escape(line.libelle), styles['BodyText']),
            str(line.quantite),
            f'{line.prix} Ar',
            f'{line.quantite * line.prix} Ar',
        ]
        for line in commande.lignes_commandes.all()
    ])
    table = Table(table_data, colWidths=[82 * mm, 25 * mm, 30 * mm, 30 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#267354')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#d8dfdc')),
        ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.extend([
        table,
        Spacer(1, 8 * mm),
        Paragraph(
            f'<b>Montant total : {facture.montant_total} Ar</b>',
            styles['Heading2'],
        ),
    ])
    document.build(elements)
    buffer.seek(0)
    return buffer
