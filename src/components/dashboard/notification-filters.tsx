"use client";

/**
 * Notification Filters Component
 *
 * Filter controls for the notification list.
 * Uses URL search params for bookmarkable/shareable filter state.
 */

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CHANNELS = ["all", "default", "prod", "dev", "personal"] as const;
const CATEGORIES = ["all", "error", "success", "info", "warning"] as const;
const PRIORITIES = ["all", "5", "4", "3", "2", "1"] as const;

const PRIORITY_LABELS: Record<string, string> = {
  all: "All Priorities",
  "5": "P5 (Urgent)",
  "4": "P4 (High)",
  "3": "P3 (Normal)",
  "2": "P2 (Low)",
  "1": "P1 (Min)",
};

export interface NotificationFiltersState {
  channel: string | null;
  category: string | null;
  minPriority: number | null;
  unreadOnly: boolean;
}

export function NotificationFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const channel = searchParams.get("channel") || "all";
  const category = searchParams.get("category") || "all";
  const minPriority = searchParams.get("minPriority") || "all";
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "all" || value === "false") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      // Reset to page 1 when filters change
      params.delete("page");

      const queryString = params.toString();
      router.push(queryString ? `?${queryString}` : "/dashboard");
    },
    [router, searchParams]
  );

  const handleChannelChange = (value: string) => {
    updateParams({ channel: value === "all" ? null : value });
  };

  const handleCategoryChange = (value: string) => {
    updateParams({ category: value === "all" ? null : value });
  };

  const handlePriorityChange = (value: string) => {
    updateParams({ minPriority: value === "all" ? null : value });
  };

  const toggleUnreadOnly = () => {
    updateParams({ unreadOnly: unreadOnly ? null : "true" });
  };

  const clearFilters = () => {
    router.push("/dashboard");
  };

  const hasFilters =
    channel !== "all" ||
    category !== "all" ||
    minPriority !== "all" ||
    unreadOnly;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Select value={channel} onValueChange={handleChannelChange}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Channel" />
        </SelectTrigger>
        <SelectContent>
          {CHANNELS.map((ch) => (
            <SelectItem key={ch} value={ch} className="text-xs">
              {ch === "all" ? "All Channels" : ch}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={category} onValueChange={handleCategoryChange}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((cat) => (
            <SelectItem key={cat} value={cat} className="text-xs capitalize">
              {cat === "all" ? "All Categories" : cat}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={minPriority} onValueChange={handlePriorityChange}>
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          {PRIORITIES.map((p) => (
            <SelectItem key={p} value={p} className="text-xs">
              {PRIORITY_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant={unreadOnly ? "default" : "outline"}
        size="sm"
        className="h-8 text-xs"
        onClick={toggleUnreadOnly}
      >
        {unreadOnly ? "Unread Only" : "All Status"}
      </Button>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={clearFilters}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}

/**
 * Parse filter state from URL search params.
 * Used by parent components to pass filters to NotificationList.
 */
export function parseFiltersFromParams(
  searchParams: URLSearchParams
): NotificationFiltersState {
  const channel = searchParams.get("channel");
  const category = searchParams.get("category");
  const minPriority = searchParams.get("minPriority");
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  return {
    channel: channel && channel !== "all" ? channel : null,
    category: category && category !== "all" ? category : null,
    minPriority: minPriority ? parseInt(minPriority, 10) : null,
    unreadOnly,
  };
}
