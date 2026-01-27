/**
 * Filter Utilities
 *
 * Shared filter parsing logic used by both server and client components.
 */

export interface NotificationFiltersState {
  channel: string | null;
  category: string | null;
  minPriority: number | null;
  unreadOnly: boolean;
}

/**
 * Parse filter state from URL search params.
 * Used by server components to pass filters to NotificationList.
 */
export function parseFiltersFromParams(
  searchParams: URLSearchParams
): NotificationFiltersState {
  const channel = searchParams.get("channel");
  const category = searchParams.get("category");
  const minPriorityStr = searchParams.get("minPriority");
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  // Validate minPriority is a valid number 1-5
  let minPriority: number | null = null;
  if (minPriorityStr) {
    const parsed = parseInt(minPriorityStr, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
      minPriority = parsed;
    }
  }

  return {
    channel: channel && channel !== "all" ? channel : null,
    category: category && category !== "all" ? category : null,
    minPriority,
    unreadOnly,
  };
}
