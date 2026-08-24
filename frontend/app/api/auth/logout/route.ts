import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ROLE_COOKIE,
  USERNAME_COOKIE,
} from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", { maxAge: 0, path: "/" });
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", { maxAge: 0, path: "/" });
  response.cookies.set(ROLE_COOKIE, "", { maxAge: 0, path: "/" });
  response.cookies.set(USERNAME_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
