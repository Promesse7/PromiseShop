import type { PaginatedResponse } from "./types";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/proxy/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data as T;
}

// Matches the backend's max_page_size cap headroom (core.pagination.StandardPagination
// allows up to 500). A whole shop catalog fits in a couple of requests.
const PAGE_SIZE = 200;

// Walk a paginated collection: one request for page 1, then every remaining page
// in parallel (the first response's count tells us how many there are). Results
// come back in page order.
export async function fetchAllPages<T>(path: string): Promise<T[]> {
  const separator = path.includes("?") ? "&" : "?";
  const pageUrl = (page: number) => `${path}${separator}page=${page}&page_size=${PAGE_SIZE}`;

  const first = await apiFetch<PaginatedResponse<T>>(pageUrl(1));
  if (!first.next) return first.results;

  const totalPages = Math.max(2, Math.ceil(first.count / PAGE_SIZE));
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => apiFetch<PaginatedResponse<T>>(pageUrl(i + 2)))
  );
  return [...first.results, ...rest.flatMap((page) => page.results)];
}

export function extractErrorMessage(body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map(String).join(" ");
    if (detail && typeof detail === "object") {
      return Object.values(detail).flat().map(String).join(" ");
    }
  }
  return "Something went wrong — try again.";
}
