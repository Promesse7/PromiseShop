import { NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ROLE_COOKIE,
  USERNAME_COOKIE,
  cookieOptions,
} from "@/lib/auth";
import type { LoginResponse } from "@/lib/types";

export async function POST(request: Request) {
  const { username, password } = (await request.json()) as {
    username: string;
    password: string;
  };

  let djangoResponse: Response;
  try {
    djangoResponse = await fetch(`${process.env.DJANGO_API_URL}/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to reach the backend service" },
      { status: 502 }
    );
  }

  if (!djangoResponse.ok) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: djangoResponse.status }
    );
  }

  const data = (await djangoResponse.json()) as LoginResponse;

  const response = NextResponse.json({ role: data.role, username });
  response.cookies.set(ACCESS_TOKEN_COOKIE, data.access, cookieOptions);
  response.cookies.set(REFRESH_TOKEN_COOKIE, data.refresh, cookieOptions);
  response.cookies.set(ROLE_COOKIE, data.role, cookieOptions);
  response.cookies.set(USERNAME_COOKIE, username, cookieOptions);

  return response;
}
