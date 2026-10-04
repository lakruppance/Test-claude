import { z } from "zod";

// Server-side environment. Parsed lazily so `next build` does not need production secrets.
const schema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  R2_ENDPOINT: z.string().url(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  STAGING_BASIC_AUTH: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // "trigger" (staging/production) or "local" (runs jobs inside this Next.js server).
  ORCHESTRATOR: z.enum(["trigger", "local"]).default("trigger"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 ** 3),
  CLIP_STYLE_DEFAULT: z.enum(["impact", "boite", "epure"]).default("impact"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  // "stripe" (staging/production) or "fake" (local only: simulated checkout, real signed webhook).
  BILLING_PROVIDER: z.enum(["stripe", "fake"]).default("stripe"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // VAT: false = prices are tax-inclusive as displayed; true = Stripe Tax computes VAT.
  STRIPE_AUTOMATIC_TAX: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid server environment: ${missing}`);
    }
    cached = parsed.data;
  }
  return cached;
}
