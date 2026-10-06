from datetime import date

from django.db.models import Q
from rest_framework import mixins, status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from operations import services
from operations.models import InternalConsumption, ShopAsset
from operations.serializers import (
    ConsumeSerializer, FromStockSerializer, InternalConsumptionSerializer, RegisterAssetSerializer,
    ReplaceSerializer, ReturnToStockSerializer, ShopAssetEventSerializer, ShopAssetSerializer, StatusSerializer,
)


def _date_param(params, key):
    raw = params.get(key)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise ValidationError({key: "Use YYYY-MM-DD."})


class ConsumptionViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                         viewsets.GenericViewSet):
    """GET: consumption log (filters from, to, product, taken_by, purpose, shop_asset). POST: consume."""

    serializer_class = InternalConsumptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = InternalConsumption.objects.select_related(
            "product", "taken_by", "recorded_by", "approved_by", "shop_asset"
        )
        params = self.request.query_params
        start, end = _date_param(params, "from"), _date_param(params, "to")
        if start:
            qs = qs.filter(created_at__date__gte=start)
        if end:
            qs = qs.filter(created_at__date__lte=end)
        for key in ("product", "taken_by", "shop_asset"):
            if params.get(key):
                qs = qs.filter(**{f"{key}_id": params[key]})
        if params.get("purpose"):
            qs = qs.filter(purpose=params["purpose"])
        return qs

    def create(self, request, *args, **kwargs):
        data = ConsumeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        record = services.consume_stock(
            v["product"], v["quantity"], v["purpose"], v["reason"], taken_by=v.get("taken_by") or request.user,
            user=request.user, asset=v.get("shop_asset"), approval=v.get("approval"),
        )
        return Response(self.get_serializer(record).data, status=http_status.HTTP_201_CREATED)


class ShopAssetViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                       viewsets.GenericViewSet):
    """Shop assets. POST registers one the shop already owned (admin/manager)."""

    serializer_class = ShopAssetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ShopAsset.objects.select_related("product", "assigned_to", "created_by", "replaces", "equipment_unit")
        params = self.request.query_params
        if params.get("status"):
            qs = qs.filter(status__in=params["status"].split(","))
        if params.get("location"):
            qs = qs.filter(location__icontains=params["location"])
        if params.get("assigned_to"):
            qs = qs.filter(assigned_to_id=params["assigned_to"])
        if params.get("product"):
            qs = qs.filter(product_id=params["product"])
        if params.get("is_spare") in ("true", "false"):
            qs = qs.filter(is_spare=params["is_spare"] == "true")
        if params.get("serial"):
            serial = params["serial"].strip()
            qs = qs.filter(Q(serial__iexact=serial) | Q(equipment_unit__serial_number__iexact=serial))
        if params.get("q"):
            q = params["q"].strip()
            qs = qs.filter(Q(name__icontains=q) | Q(serial__icontains=q) | Q(location__icontains=q))
        return qs

    def _respond(self, asset, code=http_status.HTTP_200_OK):
        return Response(self.get_serializer(asset).data, status=code)

    def create(self, request, *args, **kwargs):
        data = RegisterAssetSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        asset = services.register_asset(user=request.user, **data.validated_data)
        return self._respond(asset, http_status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="from-stock")
    def from_stock(self, request):
        data = FromStockSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        product = v.pop("product")
        asset = services.take_from_stock_as_asset(product, user=request.user, **v)
        return self._respond(asset, http_status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        asset = self.get_object()
        data = StatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        updated = services.change_asset_status(asset, v["to_status"], v["reason"], request.user,
                                               approval=v.get("approval"))
        return self._respond(updated)

    @action(detail=True, methods=["post"], url_path="replace")
    def replace(self, request, pk=None):
        asset = self.get_object()
        data = ReplaceSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        new = services.replace_asset(asset, v.pop("new_status"), v.pop("reason"), request.user, **v)
        return self._respond(new, http_status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="return-to-stock")
    def return_to_stock(self, request, pk=None):
        asset = self.get_object()
        data = ReturnToStockSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        updated = services.return_asset_to_stock(asset, data.validated_data["bucket"],
                                                 data.validated_data["reason"], request.user)
        return self._respond(updated)

    @action(detail=True, methods=["get"], url_path="events")
    def events(self, request, pk=None):
        asset = self.get_object()
        rows = asset.events.select_related("user", "approved_by", "replaced_by")
        return Response(ShopAssetEventSerializer(rows, many=True).data)
