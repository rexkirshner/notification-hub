"use client";

/**
 * Notification Card Component
 *
 * Displays a single notification with markdown support.
 * Uses DOMPurify for XSS protection when rendering markdown.
 */

import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// Configure marked globally (not inside components)
marked.setOptions({
  breaks: true,
  gfm: true,
});
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

interface NotificationCardProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
}

// Priority badge colors
const priorityColors: Record<number, string> = {
  1: "bg-gray-100 text-gray-700",
  2: "bg-blue-100 text-blue-700",
  3: "bg-green-100 text-green-700",
  4: "bg-yellow-100 text-yellow-700",
  5: "bg-red-100 text-red-700",
};

// Category badge colors
const categoryColors: Record<string, string> = {
  error: "bg-red-100 text-red-700",
  success: "bg-green-100 text-green-700",
  info: "bg-blue-100 text-blue-700",
  warning: "bg-yellow-100 text-yellow-700",
};

export function NotificationCard({ notification, onMarkRead }: NotificationCardProps) {
  const isRead = notification.readAt !== null;

  // Sanitize and render markdown
  const renderedMessage = useMemo(() => {
    if (!notification.markdown) {
      return notification.message;
    }

    const rawHtml = marked.parse(notification.message) as string;

    // Sanitize with DOMPurify - strip all dangerous content
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        "p", "br", "strong", "em", "code", "pre", "blockquote",
        "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "h5", "h6",
      ],
      ALLOWED_ATTR: ["href", "target", "rel"],
      ALLOW_DATA_ATTR: false,
    });
  }, [notification.markdown, notification.message]);

  const formattedDate = new Date(notification.createdAt).toLocaleString();

  return (
    <Card className={`transition-colors ${isRead ? "opacity-60" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold leading-tight">{notification.title}</h3>
              {notification.clickUrl && (
                <a
                  href={notification.clickUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Open link
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span>{notification.channel.name}</span>
              <span>•</span>
              <span>{notification.source}</span>
              <span>•</span>
              <span>{formattedDate}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Priority badge */}
            <span
              className={`px-2 py-0.5 text-xs rounded ${priorityColors[notification.priority] || priorityColors[3]}`}
            >
              P{notification.priority}
            </span>
            {/* Category badge */}
            {notification.category && (
              <span
                className={`px-2 py-0.5 text-xs rounded ${categoryColors[notification.category] || "bg-gray-100 text-gray-700"}`}
              >
                {notification.category}
              </span>
            )}
            {/* Mark read button */}
            {!isRead && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onMarkRead(notification.id)}
              >
                Mark read
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {notification.markdown ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: renderedMessage }}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap">{notification.message}</p>
        )}

        {/* Tags */}
        {notification.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-3 flex-wrap">
            {notification.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs bg-muted rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Delivery status */}
        {notification.deliveryStatus === "FAILED" && (
          <p className="text-xs text-destructive mt-2">
            Push delivery failed
          </p>
        )}
      </CardContent>
    </Card>
  );
}
