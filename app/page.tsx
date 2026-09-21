import { redirect } from "next/navigation";
import { getSessionEmail } from "@/server/auth/session";

export default function RootPage() {
  const email = getSessionEmail();
  redirect(email ? "/dashboard" : "/login");
}
