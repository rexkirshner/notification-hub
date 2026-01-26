"use client";

/**
 * Notification List Component
 *
 * Displays paginated list of notifications with real-time updates via SSE.
 */

import { useEffect, useState, useCallback } from "react";
import { NotificationCard } from "./notification-card";
import { Button } from "@/components/ui/button";

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

export function NotificationList() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/notifications?page=${pageNum}&limit=20&sort=createdAt&order=desc`
      );

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
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchNotifications(page);
  }, [page, fetchNotifications]);

  // SSE for real-time updates
  useEffect(() => {
    const eventSource = new EventSource("/api/notifications/stream");

    eventSource.addEventListener("notification", (event) => {
      const notification = JSON.parse(event.data) as Notification;
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
  }, [page]);

  const handleMarkRead = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });

      if (response.ok) {
        const updated = await response.json();
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? updated : n))
        );
      }
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const response = await fetch("/api/notifications/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ before: new Date().toISOString() }),
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

  return (
    <div className="space-y-4">
      {notifications.length > 0 && (
        <div className="flex justify-end">
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
          No notifications yet
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
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
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
