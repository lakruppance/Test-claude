import { NextResponse, type NextRequest } from "next/server";
import { checkBasicAuth } from "./lib/basic-auth";

// Staging gate (phase 1, before real accounts exist): HTTP Basic auth on every route.
// In staging, a missing STAGING_BASIC_AUTH denies everything rather than leaving the app open.
export function proxy(request: NextRequest) {
  const appEnv = process.env.APP_ENV ?? "development";
  if (appEnv === "development") return NextResponse.next();
  const expected = process.env.STAGING_BASIC_AUTH;
  if (appEnv === "staging" && !expected) {
    return new NextResponse("Staging access is not configured", { status: 503 });
  }
  if (expected && !checkBasicAuth(request.headers.get("authorization"), expected)) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="staging", charset="UTF-8"' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
