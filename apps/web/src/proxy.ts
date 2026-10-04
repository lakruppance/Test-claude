import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "./lib/safe-next";
import { checkBasicAuth } from "./lib/basic-auth";

const PROTECTED = ["/app", "/admin"];
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];

export async function proxy(request: NextRequest) {
  // 1. Optional staging gate (HTTP Basic) until the product is public.
  const appEnv = process.env.APP_ENV ?? "development";
  const gate = process.env.STAGING_BASIC_AUTH;
  if (appEnv === "staging" && !gate) {
    return new NextResponse("Staging access is not configured", { status: 503 });
  }
  if (appEnv !== "development" && gate && !checkBasicAuth(request.headers.get("authorization"), gate)) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="staging", charset="UTF-8"' },
    });
  }

  // 2. Refresh the Supabase session cookie and protect the app area.
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet, headers) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  if (!signedIn && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (signedIn && AUTH_PAGES.includes(path)) {
    // Already signed in: go where the sign-in was meant to lead (e.g. a plan's checkout).
    return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
  }
  return response;
}

// The Stripe webhook is excluded: Stripe cannot send the staging password, and the endpoint
// authenticates every request by its signature instead.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
