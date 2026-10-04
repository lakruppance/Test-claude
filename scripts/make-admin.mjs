// Grants the internal admin role to an existing account (local stack).
// Usage: node scripts/make-admin.mjs you@example.com
// Staging/production: run in the Supabase SQL editor instead:
//   update public.profiles set is_admin = true where email = 'you@example.com';
import { readFileSync } from "node:fs";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/make-admin.mjs <email>");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const res = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`,
  {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify({ is_admin: true }),
  },
);
const rows = await res.json();
if (!res.ok || rows.length === 0) {
  console.error(`No account found for ${email} (sign up first).`);
  process.exit(1);
}
console.log(`${email} is now admin.`);
