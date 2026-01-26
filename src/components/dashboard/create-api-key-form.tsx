"use client";

/**
 * Create API Key Form
 *
 * Form for creating new API keys with permission settings.
 * Shows the full key once after creation.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CreatedKey {
  name: string;
  key: string;
  canSend: boolean;
  canRead: boolean;
}

export function CreateApiKeyForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [canSend, setCanSend] = useState(true);
  const [canRead, setCanRead] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          canSend,
          canRead,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create API key");
      }

      // Show the key in a dialog
      setCreatedKey({
        name: data.name,
        key: data.key,
        canSend: data.canSend,
        canRead: data.canRead,
      });

      // Reset form
      setName("");
      setDescription("");
      setCanSend(true);
      setCanRead(false);

      // Notify the list to refresh
      window.dispatchEvent(new CustomEvent("apikey-created"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopyKey() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleCloseDialog() {
    setCreatedKey(null);
    setCopied(false);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create New API Key</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., CI Pipeline"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this key for?"
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="canSend"
                  checked={canSend}
                  onCheckedChange={setCanSend}
                />
                <Label htmlFor="canSend" className="text-sm font-normal">
                  Can send notifications
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="canRead"
                  checked={canRead}
                  onCheckedChange={setCanRead}
                />
                <Label htmlFor="canRead" className="text-sm font-normal">
                  Can read notifications
                </Label>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={isLoading || !name}>
              {isLoading ? "Creating..." : "Create API Key"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Show key dialog */}
      <Dialog open={!!createdKey} onOpenChange={handleCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Copy your API key now. You won&apos;t be able to see it again!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Key Name</Label>
              <p className="font-medium">{createdKey?.name}</p>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">API Key</Label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 p-2 bg-muted rounded text-sm font-mono break-all">
                  {createdKey?.key}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyKey}
                  className="flex-shrink-0"
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>

            <div className="flex gap-2 text-sm">
              {createdKey?.canSend && (
                <span className="px-2 py-1 bg-muted rounded">Send</span>
              )}
              {createdKey?.canRead && (
                <span className="px-2 py-1 bg-muted rounded">Read</span>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Use this key in the <code>Authorization</code> header:
            </p>
            <code className="block p-2 bg-muted rounded text-xs">
              Authorization: Bearer {createdKey?.key?.slice(0, 12)}...
            </code>

            <Button onClick={handleCloseDialog} className="w-full">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
