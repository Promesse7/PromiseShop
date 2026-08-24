import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";

describe("GET /api/auth/session", () => {
  it("returns the session when valid cookies are present", async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => {
        const values: Record<string, string> = {
          access_token: "jwt",
          employee_role: "sales_staff",
          employee_username: "e.mugisha",
        };
        return values[name] ? { value: values[name] } : undefined;
      },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ role: "sales_staff", username: "e.mugisha" });
  });

  it("returns 401 when no session cookies are present", async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: () => undefined,
    });

    const response = await GET();

    expect(response.status).toBe(401);
  });
});
