/**
 * Dashboard Home Page
 *
 * Shows notification list with filters and real-time updates.
 * Filters are stored in URL search params for bookmarkable state.
 */

import { Suspense } from "react";
import { NotificationList } from "@/components/dashboard/notification-list";
import { NotificationFilters } from "@/components/dashboard/notification-filters";
import { parseFiltersFromParams } from "@/lib/filters";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams;

  // Convert to URLSearchParams for consistent parsing
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      urlParams.set(key, value);
    }
  }

  const filters = parseFiltersFromParams(urlParams);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
      </div>

      <Suspense fallback={null}>
        <NotificationFilters />
      </Suspense>

      <Suspense fallback={<NotificationListSkeleton />}>
        <NotificationList filters={filters} />
      </Suspense>
    </div>
  );
}

function NotificationListSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="h-24 rounded-lg border bg-muted/50 animate-pulse"
        />
      ))}
    </div>
  );
}
