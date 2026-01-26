/**
 * Settings Page
 *
 * API key management for the dashboard.
 */

import { Suspense } from "react";
import { ApiKeyList } from "@/components/dashboard/api-key-list";
import { CreateApiKeyForm } from "@/components/dashboard/create-api-key-form";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="text-muted-foreground mt-1">
          Manage API keys for sending and reading notifications
        </p>
      </div>

      <CreateApiKeyForm />

      <div>
        <h2 className="text-lg font-semibold mb-4">Existing Keys</h2>
        <Suspense fallback={<ApiKeyListSkeleton />}>
          <ApiKeyList />
        </Suspense>
      </div>
    </div>
  );
}

function ApiKeyListSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="h-20 rounded-lg border bg-muted/50 animate-pulse"
        />
      ))}
    </div>
  );
}
