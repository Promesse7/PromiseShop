"""Give every existing sale and purchase the payment rows debt balances are
computed from. Re-runnable: rows that already have payments are skipped.

- Completed sales were all paid in full at the till: one "in" payment of the
  total, in the sale's old payment_method (cash when it was blank); non-cash
  ones get reference "MIGRATED". Cancelled/returned sales get no payment and
  stay "paid" with amount_paid 0.
- Purchases marked Paid: one "out" payment of total_paid on the purchase date.
- Purchases marked Partial/Unpaid: no payment (we don't know how much was paid);
  payment_needs_review=True so the owner confirms it from the Debts page.
"""
from datetime import datetime, time

from django.db import migrations
from django.utils import timezone


def backfill(apps, schema_editor):
    Payment = apps.get_model("finance", "Payment")
    Sale = apps.get_model("sales", "Sale")
    Purchase = apps.get_model("purchasing", "Purchase")

    paid_sale_ids = set(Payment.objects.filter(sale__isnull=False).values_list("sale_id", flat=True))
    for sale in Sale.objects.exclude(pk__in=paid_sale_ids).iterator():
        if sale.status == "completed" and sale.total_amount > 0:
            method = sale.payment_method or "cash"
            Payment.objects.create(
                direction="in", sale=sale, amount=sale.total_amount, method=method,
                reference="" if method == "cash" else "MIGRATED",
                paid_at=sale.sale_date, recorded_by_id=sale.employee_id,
                note="Migrated: paid in full at the till",
            )
            Sale.objects.filter(pk=sale.pk).update(amount_paid=sale.total_amount, payment_status="paid")
        else:
            Sale.objects.filter(pk=sale.pk).update(amount_paid=0, payment_status="paid")

    paid_purchase_ids = set(
        Payment.objects.filter(purchase__isnull=False).values_list("purchase_id", flat=True)
    )
    purchases = Purchase.objects.exclude(pk__in=paid_purchase_ids).exclude(status="cancelled")
    for purchase in purchases.iterator():
        if purchase.payment_needs_review:
            continue
        if purchase.payment_status == "paid":
            if purchase.total_paid > 0:
                paid_at = timezone.make_aware(datetime.combine(purchase.purchase_date, time(12, 0)))
                Payment.objects.create(
                    direction="out", purchase=purchase, amount=purchase.total_paid, method="cash",
                    paid_at=paid_at, recorded_by_id=purchase.employee_id,
                    note="Migrated: purchase was marked Paid",
                )
                Purchase.objects.filter(pk=purchase.pk).update(amount_paid=purchase.total_paid)
            else:
                Purchase.objects.filter(pk=purchase.pk).update(payment_status="unpaid")
        else:
            Purchase.objects.filter(pk=purchase.pk).update(
                amount_paid=0, payment_status="unpaid", payment_needs_review=True
            )


class Migration(migrations.Migration):

    dependencies = [
        ("finance", "0004_payment"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
