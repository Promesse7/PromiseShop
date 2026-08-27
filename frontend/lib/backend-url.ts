/**
 * Base URL for the Django API, e.g. "http://localhost:8000/api".
 *
 * `DJANGO_API_URL` is set directly for local dev / a standalone backend
 * deployment. In production this project deploys as a single Vercel
 * Services project instead: the frontend reaches the backend over an
 * internal service binding, which injects `BACKEND_INTERNAL_URL` as a bare
 * origin (no `/api` suffix) — see vercel.json.
 */
export function getDjangoApiUrl(): string {
  if (process.env.DJANGO_API_URL) return process.env.DJANGO_API_URL;

  if (process.env.BACKEND_INTERNAL_URL) {
    return `${process.env.BACKEND_INTERNAL_URL.replace(/\/$/, "")}/api`;
  }

  throw new Error(
    "Backend API URL is not configured: set DJANGO_API_URL or BACKEND_INTERNAL_URL"
  );
}
