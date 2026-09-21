import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16),
  ALLOWED_EMAILS: z.string().min(1),
  LLM_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Validates and returns process.env once, then caches. Throws early and
 * loudly if a required var is missing, instead of failing deep inside a
 * request handler. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid/missing environment variables: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`
    );
  }
  cached = parsed.data;
  return cached;
}

export function allowedEmails(): string[] {
  return getEnv()
    .ALLOWED_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
