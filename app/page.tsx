import { redirect } from "next/navigation";

/**
 * `/` → `/login`.
 *
 * The login page is also the landing page (marketing surface + sign-in card
 * in one). Unauthenticated visitors should always land there; authenticated
 * ones are bounced to /dashboard by the sign-in component itself.
 */
export default function RootPage() {
  redirect("/login");
}
