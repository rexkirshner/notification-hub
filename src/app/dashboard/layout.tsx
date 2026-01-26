/**
 * Dashboard Layout
 *
 * Protected layout that requires authentication.
 * Redirects to login page if not authenticated.
 */

import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/session";
import { DashboardNav } from "@/components/dashboard/nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check authentication server-side
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      <main className="container mx-auto py-6 px-4">
        {children}
      </main>
    </div>
  );
}
