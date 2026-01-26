/**
 * Notification Validation Schemas
 *
 * Zod schemas for notification API requests with strict size limits.
 */

import { z } from "zod";

/**
 * Validate clickUrl only allows safe schemes (http/https).
 * Prevents XSS via javascript:, data:, etc.
 */
const safeUrlSchema = z
  .string()
  .max(2000, "clickUrl must be at most 2000 characters")
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "clickUrl must be a valid http or https URL" }
  );

/**
 * Category enum for notification types.
 */
const categorySchema = z.enum(["error", "success", "info", "warning"]);

/**
 * Tags validation: max 10 items, max 50 chars each.
 */
const tagsSchema = z
  .array(z.string().max(50, "Each tag must be at most 50 characters"))
  .max(10, "Maximum 10 tags allowed")
  .default([]);

/**
 * Metadata validation: arbitrary JSON, max 10KB when serialized.
 */
const metadataSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (metadata) => {
      const serialized = JSON.stringify(metadata);
      return serialized.length <= 10240; // 10KB
    },
    { message: "metadata must be at most 10KB" }
  )
  .optional();

/**
 * Priority levels (1-5, matching ntfy).
 * 1 = min, 3 = default, 5 = max/urgent
 */
const prioritySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

/**
 * Schema for creating a notification.
 */
export const createNotificationSchema = z.object({
  // Required fields
  title: z
    .string()
    .min(1, "title is required")
    .max(200, "title must be at most 200 characters"),
  message: z
    .string()
    .min(1, "message is required")
    .max(10000, "message must be at most 10,000 characters"),

  // Optional categorization
  source: z.string().max(100).optional(),
  channel: z.string().max(50).optional().default("default"),
  category: categorySchema.optional(),
  tags: tagsSchema,

  // Optional display settings
  priority: prioritySchema.optional().default(3),
  markdown: z.boolean().optional().default(false),
  clickUrl: safeUrlSchema.optional(),
  metadata: metadataSchema,

  // Optional behavior
  idempotencyKey: z
    .string()
    .max(256, "idempotencyKey must be at most 256 characters")
    .optional(),
  skipPush: z.boolean().optional().default(false),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;

/**
 * Schema for listing notifications with filters and pagination.
 */
export const listNotificationsSchema = z.object({
  // Pagination
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),

  // Cursor-based pagination
  since: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const date = new Date(val);
        return !isNaN(date.getTime());
      },
      { message: "since must be a valid ISO timestamp" }
    )
    .transform((val) => (val ? new Date(val) : undefined)),

  // Filters
  channel: z.string().optional(),
  source: z.string().optional(),
  category: categorySchema.optional(),
  minPriority: z.coerce.number().int().min(1).max(5).optional(),
  tags: z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .optional(),
  deliveryStatus: z
    .enum(["PENDING", "DELIVERED", "FAILED", "SKIPPED"])
    .optional(),
  unreadOnly: z
    .string()
    .optional()
    .default("false")
    .transform((s) => s === "true"),

  // Sorting
  sort: z.enum(["createdAt", "priority"]).optional().default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type ListNotificationsInput = z.infer<typeof listNotificationsSchema>;

/**
 * Schema for unread count request.
 */
export const unreadCountSchema = z.object({
  channel: z.string().optional(),
});

export type UnreadCountInput = z.infer<typeof unreadCountSchema>;

/**
 * Schema for bulk mark read request.
 */
export const bulkMarkReadSchema = z
  .object({
    ids: z.array(z.string()).min(1, "ids array must not be empty").optional(),
    before: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          const date = new Date(val);
          return !isNaN(date.getTime());
        },
        { message: "before must be a valid ISO timestamp" }
      )
      .transform((val) => (val ? new Date(val) : undefined)),
    channel: z.string().optional(),
  })
  .refine(
    (data) => data.ids || data.before || data.channel,
    { message: "At least one of ids, before, or channel must be provided" }
  );

export type BulkMarkReadInput = z.infer<typeof bulkMarkReadSchema>;
