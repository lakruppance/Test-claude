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
  WORKER_ENDPOINT_URL: z.string().url(),
  WORKER_SHARED_SECRET: z.string().min(32),
  STAGING_BASIC_AUTH: z.string().optional(),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 ** 3),
  CLIP_STYLE_DEFAULT: z.enum(["impact", "boite", "epure"]).default("impact"),
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
