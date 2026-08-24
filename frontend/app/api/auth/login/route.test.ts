import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "./route";

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.DJANGO_API_URL = "http://localhost:8000/api";
  });

  it("returns 200 and sets cookies on successful login", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access: "access-jwt", refresh: "refresh-jwt", role: "admin" }),
    });

    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "a.uwase", password: "adminpass" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ role: "admin", username: "a.uwase" });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("access_token=access-jwt");
  });

  it("returns 401 when Django rejects the credentials", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: "No active account found with the given credentials" }),
    });

    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "a.uwase", password: "wrong" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});
