class BackfillContentLengthMiddleware:
    """Vercel's internal service-binding proxy forwards server-to-server
    requests (e.g. the frontend's fetch to this backend) as
    Transfer-Encoding: chunked with no Content-Length header. Django's ASGI
    handler buffers the full body into `request.body` regardless, but DRF's
    ``Request._get_stream()`` refuses to read the body when
    ``META['CONTENT_LENGTH']`` is absent, silently treating the request as
    empty. Backfill it from the already-buffered body before DRF sees it.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.META.get("CONTENT_LENGTH"):
            body = request.body
            if body:
                request.META["CONTENT_LENGTH"] = str(len(body))
        return self.get_response(request)
