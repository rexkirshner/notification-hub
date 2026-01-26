/**
 * Landing Page
 *
 * Redirects to dashboard (which will redirect to login if not authenticated).
 */

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
