from django.core.management import call_command
from django.db import migrations


def create_cache_table(apps, schema_editor):
    # Database cache table for the login lockout (see settings.CACHES).
    # createcachetable is a no-op when the table already exists, so this is re-runnable.
    call_command("createcachetable", database=schema_editor.connection.alias, verbosity=0)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_employee_approval_pin"),
    ]

    operations = [
        migrations.RunPython(create_cache_table, migrations.RunPython.noop),
    ]
