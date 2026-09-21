import { redirect } from "next/navigation";
import { getSessionEmail } from "@/server/auth/session";

/**
 * Reached only if middleware does not run for "/" — middleware.ts answers the
 * normal root request with a 307, which avoids the meta-refresh flash a
 * streamed redirect produces once the root loading.tsx opens a Suspense
 * boundary.
 */
export default function RootPage() {
  redirect(getSessionEmail() ? "/dashboard" : "/login");
}
