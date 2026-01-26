"use client";

/**
 * Notification Filters Component
 *
 * Filter controls for the notification list.
 * TODO: Implement actual filtering - for now this is a placeholder.
 */

import { Button } from "@/components/ui/button";

export function NotificationFilters() {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="outline" size="sm" className="text-xs">
        All Channels
      </Button>
      <Button variant="outline" size="sm" className="text-xs">
        All Categories
      </Button>
      <Button variant="outline" size="sm" className="text-xs">
        All Priorities
      </Button>
      <Button variant="outline" size="sm" className="text-xs">
        Show Read
      </Button>
    </div>
  );
}
