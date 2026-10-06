import sys

from django.core.management.base import BaseCommand

from stock.ledger import ledger_mismatches


class Command(BaseCommand):
    help = "Check that the sum of stock movements equals every Inventory bucket. Exits 1 on mismatch."

    def handle(self, *args, **options):
        mismatches = ledger_mismatches()
        if not mismatches:
            self.stdout.write(self.style.SUCCESS("Stock ledger is consistent with inventory."))
            return
        for row in mismatches:
            self.stderr.write(
                f"Product {row['product_id']} ({row['product_name']}) {row['bucket']}: "
                f"ledger {row['ledger']} vs inventory {row['inventory']}"
            )
        self.stderr.write(f"{len(mismatches)} mismatch(es) found.")
        sys.exit(1)
