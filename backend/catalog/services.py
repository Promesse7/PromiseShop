import re
from django.db import transaction

from catalog.models import Category, Product

BARCODE_PATTERN = re.compile(r"-(\d{5})$")


def generate_barcode(category: Category) -> str:
    """Compute the next shop-assigned barcode for a category.

    Must be called inside a transaction. Locks the category row so two
    concurrent product creations in the same category can't compute the
    same next number.
    """
    locked_category = Category.objects.select_for_update().get(pk=category.pk)

    max_suffix = 0
    for barcode in Product.objects.filter(category=locked_category).values_list(
        "barcode", flat=True
    ):
        match = BARCODE_PATTERN.search(barcode)
        if match:
            max_suffix = max(max_suffix, int(match.group(1)))

    next_number = max_suffix + 1
    return f"PES-{locked_category.code}-{next_number:05d}"
