"use client";

/**
 * API Key List Component
 *
 * Displays list of API keys with revoke functionality.
 */

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  description: string | null;
  canSend: boolean;
  canRead: boolean;
  rateLimit: number;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export function ApiKeyList() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/keys");
      if (!response.ok) {
        throw new Error("Failed to fetch API keys");
      }
      const data = await response.json();
      setKeys(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  // Listen for new key creation events
  useEffect(() => {
    const handleNewKey = () => fetchKeys();
    window.addEventListener("apikey-created", handleNewKey);
    return () => window.removeEventListener("apikey-created", handleNewKey);
  }, [fetchKeys]);

  const handleRevoke = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Failed to revoke key");
      }
      // Refresh the list
      fetchKeys();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke key");
    }
  };

  if (isLoading && keys.length === 0) {
    return <p className="text-muted-foreground">Loading API keys...</p>;
  }

  if (error) {
    return (
      <div>
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={fetchKeys}>Retry</Button>
      </div>
    );
  }

  if (keys.length === 0) {
    return (
      <p className="text-muted-foreground">
        No API keys yet. Create one above to get started.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {keys.map((key) => (
        <Card key={key.id} className={key.isActive ? "" : "opacity-60"}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{key.name}</h3>
                  {!key.isActive && (
                    <Badge variant="secondary">Revoked</Badge>
                  )}
                </div>
                <p className="text-sm font-mono text-muted-foreground">
                  {key.prefix}...
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {key.canSend && <Badge variant="outline">Send</Badge>}
                {key.canRead && <Badge variant="outline">Read</Badge>}
                {key.isActive && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleRevoke(key.id)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {key.description && (
              <p className="text-sm text-muted-foreground mb-2">
                {key.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Rate limit: {key.rateLimit}/min</span>
              {key.lastUsedAt && (
                <span>
                  Last used: {new Date(key.lastUsedAt).toLocaleDateString()}
                </span>
              )}
              {key.expiresAt && (
                <span>
                  Expires: {new Date(key.expiresAt).toLocaleDateString()}
                </span>
              )}
              <span>
                Created: {new Date(key.createdAt).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
