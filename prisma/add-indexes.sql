-- Performance indexes for Notification Hub
-- Run this after initial schema setup (prisma db push)
-- These indexes improve query performance for common operations.
-- Usage: npx prisma db execute --file prisma/add-indexes.sql

-- GIN index for tags array - enables fast tag filtering
-- Required for efficient: WHERE tags @> ARRAY['tag1', 'tag2']
CREATE INDEX IF NOT EXISTS idx_notifications_tags_gin
  ON notifications USING GIN(tags);

-- Partial index for unread notifications - optimizes unread count queries
-- This is the "hottest" query (badge count, filtering)
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications("channelId", "createdAt" DESC)
  WHERE "readAt" IS NULL;

-- Composite index for common listing queries
-- Optimizes: WHERE channelId = ? AND deliveryStatus = ? ORDER BY createdAt DESC
CREATE INDEX IF NOT EXISTS idx_notifications_channel_status_created
  ON notifications("channelId", "deliveryStatus", "createdAt" DESC);

-- Index for rate limiting queries
-- Optimizes: SELECT COUNT(*) WHERE apiKeyId = ? AND createdAt >= ?
CREATE INDEX IF NOT EXISTS idx_notifications_apikey_created
  ON notifications("apiKeyId", "createdAt" DESC);
