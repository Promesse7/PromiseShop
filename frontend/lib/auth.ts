import { cookies } from "next/headers";
import type { EmployeeRole, Session } from "./types";

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const ROLE_COOKIE = "employee_role";
export const USERNAME_COOKIE = "employee_username";

const isProduction = process.env.NODE_ENV === "production";

export const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
};

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const role = cookieStore.get(ROLE_COOKIE)?.value as EmployeeRole | undefined;
  const username = cookieStore.get(USERNAME_COOKIE)?.value;

  if (!accessToken || !role || !username) {
    return null;
  }

  return { role, username };
}
