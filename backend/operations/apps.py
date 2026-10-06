from django.apps import AppConfig


class OperationsConfig(AppConfig):
    default_auto_field = "django.db.models.AutoField"
    name = "operations"

    def ready(self):
        # Product merge (catalog.merge) runs a list of steps; shop-use rows follow
        # the kept product. Inserted before "stock" so the stock transfer stays last.
        from catalog import merge
        from operations.merge import move_shop_use

        names = [name for name, _ in merge.MERGE_STEPS]
        if "shop_use" not in names:
            merge.MERGE_STEPS.insert(names.index("stock"), ("shop_use", move_shop_use))
