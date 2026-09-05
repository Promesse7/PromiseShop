from django.db import migrations, models


def backfill_list_price(apps, schema_editor):
    # Price overrides did not exist before this field, so every historical line
    # was sold at its catalog price: list_price == unit_price.
    SaleItem = apps.get_model("sales", "SaleItem")
    SaleItem.objects.update(list_price=models.F("unit_price"))


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0003_saleitem_tax_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="saleitem",
            name="list_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
            preserve_default=False,
        ),
        migrations.RunPython(backfill_list_price, migrations.RunPython.noop),
    ]
