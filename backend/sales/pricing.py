"""Bargaining rules at the till (Module C).

| Line price vs list                                  | Sales staff / technician | Manager / admin      |
| At or above list (markup)                           | allowed                  | allowed              |
| Below list, within the max %, at or above the floor | allowed                  | allowed              |
| More than the max % below list, at or above floor   | needs approval           | allowed              |
| Below the floor                                     | needs approval + note    | allowed, note needed |
| Zero or negative                                    | refused                  | refused              |

The floor is the product's min_price when set, otherwise the weighted average
paid cost; with neither known there is no floor. Staff never see the floor or
the cost — only which rule a line falls under.
"""
from dataclasses import dataclass
from decimal import Decimal

from accounts.services import can_approve
from finance.models import ShopProfile

HUNDRED = Decimal("100")
DEFAULT_MAX_PCT = Decimal("10.00")

MARKUP = "markup"
AT_LIST = "at_list"
DISCOUNT = "discount"
NEEDS_APPROVAL = "needs_approval"
BELOW_FLOOR = "below_floor"


@dataclass
class LineVerdict:
    rule: str
    discount_pct: Decimal
    needs_approval: bool
    needs_note: bool


def max_staff_discount_pct():
    profile = ShopProfile.objects.filter(pk=1).only("max_staff_discount_pct").first()
    return profile.max_staff_discount_pct if profile else DEFAULT_MAX_PCT


def price_floor(product, cost_at_sale):
    return product.min_price if product.min_price is not None else cost_at_sale


def evaluate_line(*, unit_price, list_price, floor, seller, max_pct):
    """Which rule a line price falls under, and what it needs from this seller."""
    if unit_price <= 0:
        raise ValueError("A line price must be above zero.")
    discount_pct = ((list_price - unit_price) / list_price * HUNDRED).quantize(Decimal("0.01")) if list_price else Decimal("0")
    privileged = can_approve(seller)

    if floor is not None and unit_price < floor:
        return LineVerdict(BELOW_FLOOR, discount_pct, needs_approval=not privileged, needs_note=True)
    if unit_price > list_price:
        return LineVerdict(MARKUP, discount_pct, needs_approval=False, needs_note=False)
    if unit_price == list_price:
        return LineVerdict(AT_LIST, discount_pct, needs_approval=False, needs_note=False)
    if discount_pct > max_pct:
        return LineVerdict(NEEDS_APPROVAL, discount_pct, needs_approval=not privileged, needs_note=False)
    return LineVerdict(DISCOUNT, discount_pct, needs_approval=False, needs_note=False)
