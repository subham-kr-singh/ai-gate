import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireUserId } from "@/server/auth/session";
import { UserInputError } from "@/server/domains/planner/errors";

/** Route handlers stay thin: authenticate, validate, call a domain service, return JSON. */
export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);

type Ctx<P> = { params: Promise<P> };

export function withUser<P = Record<string, never>>(
  handler: (userId: string, req: Request, params: P) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx<P>): Promise<Response> => {
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      // A redirect() from the session helper must keep working.
      if (typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")) throw e;
      return json({ error: "Sign in to continue." }, { status: 401 });
    }
    try {
      return await handler(userId, req, ctx?.params ? await ctx.params : ({} as P));
    } catch (e) {
      if (e instanceof ZodError) {
        return json({ error: "Some fields need attention.", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
      }
      if (e instanceof UserInputError) return json({ error: e.message, field: e.field }, { status: 400 });
      console.error(e);
      return json({ error: "Something went wrong on our side. Try again in a moment." }, { status: 500 });
    }
  };
}
