from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    detail = response.data.get("detail") if isinstance(response.data, dict) else None
    response.data = {
        "detail": detail or response.data,
        "code": getattr(exc, "default_code", "error"),
    }
    return response
