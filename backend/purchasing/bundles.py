"""Splitting one bundle price across its components (Module F)."""
from decimal import ROUND_DOWN, Decimal

CENT = Decimal("0.01")


def split_cost(total, weights):
    """Split ``total`` in proportion to ``weights``, to the cent, summing exactly.

    Each share is rounded down; the leftover cents all go to the largest share
    (the first one on a tie) — "rounding leftovers go to the most expensive
    component". All-zero weights split evenly.
    """
    total = Decimal(total)
    weights = [Decimal(w) for w in weights]
    if not weights:
        return []
    weight_sum = sum(weights)
    if weight_sum <= 0:
        weights = [Decimal(1)] * len(weights)
        weight_sum = Decimal(len(weights))
    shares = [(total * w / weight_sum).quantize(CENT, rounding=ROUND_DOWN) for w in weights]
    remainder = total - sum(shares)
    if remainder:
        largest = max(range(len(shares)), key=lambda i: (weights[i], -i))
        shares[largest] += remainder
    return shares


def default_weights(components):
    """components: [(retail_price | None, qty_per_bundle)] -> weights.

    Retail price x quantity. A component without a price is weighted at the
    average per-unit retail price of the priced ones; when none is priced the
    split is by quantity.
    """
    priced = [(Decimal(price), qty) for price, qty in components if price is not None and Decimal(price) > 0]
    if not priced:
        return [Decimal(qty) for _, qty in components]
    priced_units = sum(qty for _, qty in priced)
    average_unit_price = sum(price * qty for price, qty in priced) / priced_units
    return [
        (Decimal(price) if price is not None and Decimal(price) > 0 else average_unit_price) * qty
        for price, qty in components
    ]


def default_split(components, paid_per_bundle, invoiced_per_bundle):
    """[(retail_price | None, qty)] -> [(allocated_paid, allocated_invoiced)] per bundle."""
    weights = default_weights(components)
    paid = split_cost(paid_per_bundle, weights)
    invoiced = split_cost(invoiced_per_bundle, weights)
    return list(zip(paid, invoiced))
