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

export async function fetchAllPages<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const separator = path.includes("?") ? "&" : "?";

  while (true) {
    const data = await apiFetch<PaginatedResponse<T>>(`${path}${separator}page=${page}`);
    results.push(...data.results);
    if (!data.next) break;
    page += 1;
  }

  return results;
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
