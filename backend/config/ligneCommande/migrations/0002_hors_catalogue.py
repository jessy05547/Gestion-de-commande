from django.db import migrations, models
import django.db.models.deletion


def copy_product_names_to_line_labels(apps, schema_editor):
    LigneCommande = apps.get_model('ligneCommande', 'LigneCommande')
    for line in LigneCommande.objects.select_related('fk_id_produit').iterator():
        line.libelle = line.fk_id_produit.nomProduit
        line.save(update_fields=['libelle'])


class Migration(migrations.Migration):

    dependencies = [
        ('commandes', '0003_alter_commande_reference'),
        ('ligneCommande', '0001_initial'),
        ('produit', '0003_alter_produit_codeproduit'),
    ]

    operations = [
        migrations.AddField(
            model_name='lignecommande',
            name='libelle',
            field=models.CharField(max_length=255, null=True),
        ),
        migrations.RunPython(copy_product_names_to_line_labels, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='lignecommande',
            name='fk_id_produit',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='lignes_commandes',
                to='produit.produit',
            ),
        ),
        migrations.AlterField(
            model_name='lignecommande',
            name='libelle',
            field=models.CharField(max_length=255),
        ),
    ]
