import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth-errors";
import { supabaseServer } from "@/lib/supabase/server";

// Email confirmation, password recovery and Google sign-in all land here with a PKCE code.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=callback", url.origin));
}
