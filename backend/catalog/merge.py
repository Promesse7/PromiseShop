"""Product merges (release Module E4)."""


def merged_product_ids(product_id):
    """``product_id`` plus every product merged into it, directly or through a chain."""
    from catalog.models import ProductMerge

    ids = {product_id}
    frontier = {product_id}
    while frontier:
        found = set(
            ProductMerge.objects.filter(keep_id__in=frontier).values_list("duplicate_id", flat=True)
        ) - ids
        ids |= found
        frontier = found
    return ids
