import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";

describe("GET /api/proxy/[...path]", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.DJANGO_API_URL = "http://localhost:8000/api";
  });

  it("forwards the request to Django with the access token attached", async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) =>
        name === "access_token" ? { value: "valid-jwt" } : undefined,
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ count: 0, results: [] }),
    });

    const request = new Request("http://localhost:3000/api/proxy/notifications/");
    const response = await GET(request, { params: Promise.resolve({ path: ["notifications"] }) });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/notifications/",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer valid-jwt" }),
      })
    );
  });

  it("returns 401 when there is no access token cookie", async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({ get: () => undefined });

    const request = new Request("http://localhost:3000/api/proxy/notifications/");
    const response = await GET(request, { params: Promise.resolve({ path: ["notifications"] }) });

    expect(response.status).toBe(401);
  });

  it("refreshes the access token and retries after a 401 from Django, and returns the retried response", async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => {
        if (name === "access_token") return { value: "stale-jwt" };
        if (name === "refresh_token") return { value: "valid-refresh-jwt" };
        return undefined;
      },
    });
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      // first forward attempt -> 401
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: "token expired" }),
      })
      // refresh call -> 200 with new access token
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access: "new-jwt" }),
      })
      // retried forward attempt -> 200
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ count: 1, results: [{ id: 1 }] }),
      });

    const request = new Request("http://localhost:3000/api/proxy/notifications/");
    const response = await GET(request, { params: Promise.resolve({ path: ["notifications"] }) });
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(response.status).toBe(200);
    expect(body).toEqual({ count: 1, results: [{ id: 1 }] });

    // retried request used the refreshed token
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:8000/api/notifications/",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer new-jwt" }),
      })
    );

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("access_token=new-jwt");
  });

  it("clears cookies and returns 401 when the refresh call itself fails", async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => {
        if (name === "access_token") return { value: "stale-jwt" };
        if (name === "refresh_token") return { value: "expired-refresh-jwt" };
        return undefined;
      },
    });
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      // first forward attempt -> 401
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: "token expired" }),
      })
      // refresh call -> fails (refresh token invalid/expired)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: "invalid refresh token" }),
      });

    const request = new Request("http://localhost:3000/api/proxy/notifications/");
    const response = await GET(request, { params: Promise.resolve({ path: ["notifications"] }) });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(401);

    const setCookieHeaders = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
    const accessCookie = setCookieHeaders.find((c) => c.startsWith("access_token="));
    const refreshCookie = setCookieHeaders.find((c) => c.startsWith("refresh_token="));

    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();
    expect(accessCookie).toMatch(/Max-Age=0/i);
    expect(refreshCookie).toMatch(/Max-Age=0/i);
  });

  it("clears cookies and returns 401 when there is no refresh token cookie to use", async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => (name === "access_token" ? { value: "stale-jwt" } : undefined),
    });
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: "token expired" }),
    });

    const request = new Request("http://localhost:3000/api/proxy/notifications/");
    const response = await GET(request, { params: Promise.resolve({ path: ["notifications"] }) });

    // no refresh call should have been attempted since there's no refresh token
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);

    const setCookieHeaders = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
    const accessCookie = setCookieHeaders.find((c) => c.startsWith("access_token="));
    const refreshCookie = setCookieHeaders.find((c) => c.startsWith("refresh_token="));

    expect(accessCookie).toMatch(/Max-Age=0/i);
    expect(refreshCookie).toMatch(/Max-Age=0/i);
  });

  it("returns 502 when Django is unreachable on the initial forward request", async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => (name === "access_token" ? { value: "valid-jwt" } : undefined),
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("fetch failed")
    );

    const request = new Request("http://localhost:3000/api/proxy/notifications/");
    const response = await GET(request, { params: Promise.resolve({ path: ["notifications"] }) });
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: "Unable to reach the backend service" });
  });
});
