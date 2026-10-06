from django.db import migrations
from django.db.models import F


def forwards(apps, schema_editor):
    """Bring whole-sale reversals made before Module G in line with the new model.

    - "cancelled" becomes "voided" (stock already went back; the sale was never paid
      in the debt model, so amount_paid is 0).
    - A legacy "returned" sale had every unit put back with no SaleReturn rows, so
      its whole value counts as returned and its balance stays 0.

    Re-runnable: voided sales are untouched, and only returned sales still showing
    no returned value (and no return rows) are filled in.
    """
    Sale = apps.get_model("sales", "Sale")
    Sale.objects.filter(status="cancelled").update(status="voided")
    Sale.objects.filter(status="returned", returned_amount=0, returns__isnull=True).update(
        returned_amount=F("total_amount")
    )


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0007_module_g"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
