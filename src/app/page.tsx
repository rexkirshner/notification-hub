/**
 * Landing Page
 *
 * Temporary landing page - will redirect to dashboard once implemented.
 */

import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <main className="flex flex-col items-center gap-8 px-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Notification Hub
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Centralized notification system for all your projects.
        </p>
        <div className="flex gap-4">
          <Link
            href="/api/health"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Health Check
          </Link>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Dashboard coming soon
        </p>
      </main>
    </div>
  );
}
