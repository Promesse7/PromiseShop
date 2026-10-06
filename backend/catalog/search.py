"""Product search (release Module E1).

Ranking, best first:
  1. barcode   — the query is exactly a product barcode or a barcode alias
  2. exact_name — the normalised query equals the normalised product name
  3. starts_with — name+brand+model starts with the query
  4. similar   — trigram similarity >= SIMILARITY_THRESHOLD, or the query appears
                 inside name+brand+model
Inside a tier, higher similarity first, then name.
"""
from django.contrib.postgres.search import TrigramSimilarity, TrigramWordSimilarity
from django.db.models import Case, Exists, F, FloatField, IntegerField, OuterRef, Q, Value, When
from django.db.models.functions import Greatest

SIMILARITY_THRESHOLD = 0.3
DEFAULT_LIMIT = 8
MAX_LIMIT = 50

TIER_NAMES = {1: "barcode", 2: "exact_name", 3: "starts_with", 4: "similar"}


def normalise_text(value):
    """Lowercase and collapse runs of whitespace; None becomes ""."""
    return " ".join(str(value or "").lower().split())


def search_products(query, *, include_inactive=False, limit=DEFAULT_LIMIT):
    """Return up to `limit` Products annotated with `match_tier` and `match_score`."""
    from catalog.models import Product, ProductBarcodeAlias

    raw = (query or "").strip()
    normalised = normalise_text(raw)
    if not normalised:
        return []

    alias_hit = ProductBarcodeAlias.objects.filter(product=OuterRef("pk"), barcode__iexact=raw)
    queryset = Product.objects.all() if include_inactive else Product.objects.filter(is_active=True)
    queryset = queryset.annotate(
        alias_hit=Exists(alias_hit),
        match_score=Greatest(
            TrigramSimilarity("search_text", Value(normalised)),
            TrigramWordSimilarity(Value(normalised), "search_text"),
            output_field=FloatField(),
        ),
    ).annotate(
        match_tier=Case(
            When(Q(barcode__iexact=raw) | Q(alias_hit=True), then=Value(1)),
            When(normalized_name=normalised, then=Value(2)),
            When(Q(search_text__startswith=normalised) | Q(normalized_name__startswith=normalised), then=Value(3)),
            When(Q(match_score__gte=SIMILARITY_THRESHOLD) | Q(search_text__contains=normalised), then=Value(4)),
            default=Value(0),
            output_field=IntegerField(),
        )
    )
    return list(
        queryset.filter(match_tier__gt=0)
        .select_related("category")
        .order_by("match_tier", F("match_score").desc(), "name", "product_id")[:limit]
    )
