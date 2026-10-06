from django.db import migrations, models


def relabel_sent_as_logged(apps, schema_editor):
    # No notification was ever emailed: every "sent" row was only recorded in the
    # app. Re-runnable — rows already "logged" are untouched.
    NotificationLog = apps.get_model("notifications", "NotificationLog")
    NotificationLog.objects.filter(status="sent").update(status="logged")


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0002_notificationlog_read_at"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notificationlog",
            name="status",
            field=models.CharField(
                choices=[("logged", "Logged in app"), ("sent", "Sent"), ("failed", "Failed")],
                default="logged", max_length=20,
            ),
        ),
        migrations.RunPython(relabel_sent_as_logged, migrations.RunPython.noop),
    ]
