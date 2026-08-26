from django.db import migrations


def seed_shop_profile(apps, schema_editor):
    ShopProfile = apps.get_model("finance", "ShopProfile")
    ShopProfile.objects.get_or_create(
        pk=1,
        defaults={
            "business_name": "Promise Electronic Shop",
            "tin": None,
            "po_box": None,
            "phone": None,
            "email": None,
            "address": None,
        },
    )


def unseed_shop_profile(apps, schema_editor):
    ShopProfile = apps.get_model("finance", "ShopProfile")
    ShopProfile.objects.filter(pk=1).delete()


class Migration(migrations.Migration):
    dependencies = [("finance", "0002_shopprofile")]
    operations = [migrations.RunPython(seed_shop_profile, unseed_shop_profile)]
