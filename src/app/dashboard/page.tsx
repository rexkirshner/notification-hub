/**
 * Dashboard Home Page
 *
 * Shows notification list with filters and real-time updates.
 */

import { Suspense } from "react";
import { NotificationList } from "@/components/dashboard/notification-list";
import { NotificationFilters } from "@/components/dashboard/notification-filters";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
      </div>

      <NotificationFilters />

      <Suspense fallback={<NotificationListSkeleton />}>
        <NotificationList />
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
