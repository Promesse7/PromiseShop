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
});
