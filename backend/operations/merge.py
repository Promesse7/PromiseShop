"""Product-merge step (catalog.merge.MERGE_STEPS): shop-use rows follow the kept product."""


def move_shop_use(keep, duplicate, context):
    from operations.models import InternalConsumption, ShopAsset

    moved = ShopAsset.objects.filter(product=duplicate).update(product=keep)
    moved += InternalConsumption.objects.filter(product=duplicate).reassign_product(keep)
    return moved
