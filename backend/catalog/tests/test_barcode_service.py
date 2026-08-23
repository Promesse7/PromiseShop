import pytest
from django.db import transaction
from catalog.models import Category, Product
from catalog.services import generate_barcode

pytestmark = pytest.mark.django_db


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


def make_product(category, barcode, name="Some product"):
    return Product.objects.create(
        category=category, barcode=barcode, name=name,
    )


def test_first_barcode_in_category_is_00001(category):
    with transaction.atomic():
        barcode = generate_barcode(category)
    assert barcode == "PES-AUD-00001"


def test_next_barcode_increments_from_max_existing(category):
    make_product(category, "PES-AUD-00001")
    make_product(category, "PES-AUD-00147")
    with transaction.atomic():
        barcode = generate_barcode(category)
    assert barcode == "PES-AUD-00148"


def test_barcode_does_not_reuse_number_after_deletion(category):
    p1 = make_product(category, "PES-AUD-00001")
    make_product(category, "PES-AUD-00002")
    p1.delete()
    with transaction.atomic():
        barcode = generate_barcode(category)
    assert barcode == "PES-AUD-00003"


def test_sequential_calls_produce_distinct_barcodes(category):
    with transaction.atomic():
        first = generate_barcode(category)
        make_product(category, first)
        second = generate_barcode(category)
    assert first != second
    assert second == "PES-AUD-00002"


def test_different_categories_have_independent_sequences():
    audio = Category.objects.create(name="Audio", code="AUD")
    tv = Category.objects.create(name="Televisions", code="TV")
    make_product(audio, "PES-AUD-00005")
    with transaction.atomic():
        tv_barcode = generate_barcode(tv)
    assert tv_barcode == "PES-TV-00001"
