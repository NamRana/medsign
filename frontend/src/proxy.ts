import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/auth/callback",
  "/ai-lab-report-analyzer",
  "/ai-symptom-checker",
  "/online-prescription",
  "/how-it-works",
  "/medical-safety",
  "/opengraph-image",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
  "/sw.js",
]);

const NOINDEX_PUBLIC_PATHS = new Set(["/login", "/signup", "/auth/callback"]);

function noindex(response: NextResponse) {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    const response = NextResponse.next();
    return NOINDEX_PUBLIC_PATHS.has(pathname) ? noindex(response) : response;
  }

  const hasSession = request.cookies.getAll().some(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token")
  );

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return noindex(NextResponse.redirect(loginUrl));
  }

  return noindex(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|xml|txt|json|js)$).*)",
  ],
};
