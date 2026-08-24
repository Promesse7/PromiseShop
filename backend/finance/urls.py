from rest_framework.routers import DefaultRouter
from finance.views import ExpenseViewSet

router = DefaultRouter()
router.register("expenses", ExpenseViewSet, basename="expense")

urlpatterns = router.urls
