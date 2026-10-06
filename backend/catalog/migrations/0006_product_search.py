import django.contrib.postgres.indexes
import django.db.models.deletion
from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations, models


def _normalise(value):
    # Mirrors catalog.search.normalise_text; copied so the migration never
    # changes behaviour if that module does.
    return " ".join(str(value or "").lower().split())


def backfill_search_columns(apps, schema_editor):
    # Re-runnable: recomputes every row from name/brand/model.
    Product = apps.get_model("catalog", "Product")
    for product in Product.objects.only("product_id", "name", "brand", "model_number").iterator():
        Product.objects.filter(pk=product.pk).update(
            normalized_name=_normalise(product.name),
            search_text=_normalise(" ".join([product.name or "", product.brand or "", product.model_number or ""])),
        )


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0005_product_tax_category"),
    ]

    operations = [
        TrigramExtension(),
        migrations.CreateModel(
            name="ProductBarcodeAlias",
            fields=[
                ("alias_id", models.AutoField(primary_key=True, serialize=False)),
                ("barcode", models.CharField(max_length=50, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.AddField(
            model_name="product",
            name="normalized_name",
            field=models.CharField(db_index=True, default="", editable=False, max_length=150),
        ),
        migrations.AddField(
            model_name="product",
            name="search_text",
            field=models.CharField(default="", editable=False, max_length=320),
        ),
        migrations.AddIndex(
            model_name="product",
            index=django.contrib.postgres.indexes.GinIndex(
                fields=["search_text"], name="product_search_trgm", opclasses=["gin_trgm_ops"]
            ),
        ),
        migrations.AddField(
            model_name="productbarcodealias",
            name="product",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="barcode_aliases", to="catalog.product"
            ),
        ),
        migrations.RunPython(backfill_search_columns, migrations.RunPython.noop),
    ]
