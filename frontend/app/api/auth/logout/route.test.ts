import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  it("clears all session cookies", async () => {
    const response = await POST();
    const setCookie = response.headers.getSetCookie();

    expect(setCookie.some((c) => c.startsWith("access_token=;"))).toBe(true);
    expect(setCookie.some((c) => c.startsWith("refresh_token=;"))).toBe(true);
    expect(setCookie.some((c) => c.startsWith("employee_role=;"))).toBe(true);
    expect(setCookie.some((c) => c.startsWith("employee_username=;"))).toBe(true);
  });
});
