import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  cookieOptions,
} from "@/lib/auth";

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: RouteContext, method: string) {
  const { path } = await context.params;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  const url = new URL(request.url);
  const targetUrl = `${process.env.DJANGO_API_URL}/${path.join("/")}/${url.search}`;

  const body =
    method === "GET" || method === "DELETE" ? undefined : await request.text();

  const djangoResponse = await fetch(targetUrl, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });

  if (djangoResponse.status === 401) {
    const refreshed = await tryRefresh(cookieStore);
    if (refreshed) {
      const retryResponse = await fetch(targetUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${refreshed}`,
        },
        body,
      });
      const retryData = await retryResponse.json().catch(() => null);
      const response = NextResponse.json(retryData, { status: retryResponse.status });
      response.cookies.set(ACCESS_TOKEN_COOKIE, refreshed, cookieOptions);
      return response;
    }

    const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
    response.cookies.set(ACCESS_TOKEN_COOKIE, "", { maxAge: 0, path: "/" });
    response.cookies.set(REFRESH_TOKEN_COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  }

  const data = await djangoResponse.json().catch(() => null);
  return NextResponse.json(data, { status: djangoResponse.status });
}

async function tryRefresh(
  cookieStore: Awaited<ReturnType<typeof cookies>>
): Promise<string | null> {
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return null;

  const refreshResponse = await fetch(`${process.env.DJANGO_API_URL}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
  });

  if (!refreshResponse.ok) return null;

  const data = (await refreshResponse.json()) as { access: string };
  return data.access;
}

export async function GET(request: Request, context: RouteContext) {
  return forward(request, context, "GET");
}

export async function POST(request: Request, context: RouteContext) {
  return forward(request, context, "POST");
}

export async function PATCH(request: Request, context: RouteContext) {
  return forward(request, context, "PATCH");
}

export async function PUT(request: Request, context: RouteContext) {
  return forward(request, context, "PUT");
}

export async function DELETE(request: Request, context: RouteContext) {
  return forward(request, context, "DELETE");
}
