from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Default 20 per page, but a client may ask for up to 500 with ?page_size=.

    The frontend walks whole collections (products, inventory, pricing) to
    build its in-memory catalog; at 20 per page that was dozens of sequential
    round-trips before anything rendered. The cap keeps a runaway client from
    pulling an unbounded page.
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 500
