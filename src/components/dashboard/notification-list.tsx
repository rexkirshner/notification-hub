"use client";

/**
 * Notification List Component
 *
 * Displays paginated list of notifications with real-time updates via SSE.
 * Accepts filter props from parent for channel, category, priority, and read status.
 */

import { useEffect, useState, useCallback } from "react";
import { NotificationCard } from "./notification-card";
import { Button } from "@/components/ui/button";
import type { NotificationFiltersState } from "@/lib/filters";

interface Notification {
  id: string;
  title: string;
  message: string;
  markdown: boolean;
  source: string;
  category: string | null;
  tags: string[];
  priority: number;
  clickUrl: string | null;
  deliveryStatus: string;
  readAt: string | null;
  createdAt: string;
  channel: {
    id: string;
    name: string;
  };
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface NotificationListProps {
  filters: NotificationFiltersState;
}

export function NotificationList({ filters }: NotificationListProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Build query string from filters
  const buildQueryString = useCallback(
    (pageNum: number) => {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("limit", "20");
      params.set("sort", "createdAt");
      params.set("order", "desc");

      if (filters.channel) {
        params.set("channel", filters.channel);
      }
      if (filters.category) {
        params.set("category", filters.category);
      }
      if (filters.minPriority) {
        params.set("minPriority", String(filters.minPriority));
      }
      if (filters.unreadOnly) {
        params.set("unreadOnly", "true");
      }

      return params.toString();
    },
    [filters]
  );

  const fetchNotifications = useCallback(
    async (pageNum: number) => {
      setIsLoading(true);
      setError(null);

      try {
        const queryString = buildQueryString(pageNum);
        const response = await fetch(`/api/notifications?${queryString}`);

        if (!response.ok) {
          throw new Error("Failed to fetch notifications");
        }

        const data = await response.json();
        setNotifications(data.data);
        setPagination(data.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    },
    [buildQueryString]
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [filters]);

  // Fetch when page or filters change
  useEffect(() => {
    fetchNotifications(page);
  }, [page, fetchNotifications]);

  // SSE for real-time updates
  useEffect(() => {
    // Build SSE URL with channel filter if set
    const sseParams = new URLSearchParams();
    if (filters.channel) {
      sseParams.set("channel", filters.channel);
    }
    if (filters.minPriority) {
      sseParams.set("minPriority", String(filters.minPriority));
    }
    const sseUrl = sseParams.toString()
      ? `/api/notifications/stream?${sseParams.toString()}`
      : "/api/notifications/stream";

    const eventSource = new EventSource(sseUrl);

    eventSource.addEventListener("notification", (event) => {
      const notification = JSON.parse(event.data) as Notification;

      // Apply client-side filters
      if (filters.category && notification.category !== filters.category) {
        return;
      }
      if (filters.unreadOnly && notification.readAt !== null) {
        return;
      }

      // Add new notification to the top if on first page
      if (page === 1) {
        setNotifications((prev) => [notification, ...prev.slice(0, 19)]);
      }
    });

    eventSource.addEventListener("error", () => {
      // EventSource will automatically reconnect
      console.error("SSE connection error");
    });

    return () => {
      eventSource.close();
    };
  }, [page, filters]);

  const handleMarkRead = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });

      if (response.ok) {
        const updated = await response.json();

        if (filters.unreadOnly) {
          // Remove from list if filtering by unread
          setNotifications((prev) => prev.filter((n) => n.id !== id));
        } else {
          setNotifications((prev) =>
            prev.map((n) => (n.id === id ? updated : n))
          );
        }
      }
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const body: Record<string, unknown> = {
        before: new Date().toISOString(),
      };

      // If filtering by channel, only mark that channel's notifications
      if (filters.channel) {
        body.channel = filters.channel;
      }

      const response = await fetch("/api/notifications/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        // Refresh the list
        fetchNotifications(page);
      }
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={() => fetchNotifications(page)}>Retry</Button>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-4">
      {notifications.length > 0 && unreadCount > 0 && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {unreadCount} unread on this page
          </span>
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            Mark all as read
          </Button>
        </div>
      )}

      {isLoading && notifications.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading notifications...
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {filters.channel || filters.category || filters.unreadOnly
            ? "No notifications match the current filters"
            : "No notifications yet"}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {notifications.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onMarkRead={handleMarkRead}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPage((p) => Math.min(pagination.totalPages, p + 1))
                }
                disabled={page === pagination.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
