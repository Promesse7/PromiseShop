from rest_framework.routers import DefaultRouter
from notifications.views import NotificationLogViewSet

router = DefaultRouter()
router.register("notifications", NotificationLogViewSet, basename="notification")

urlpatterns = router.urls
