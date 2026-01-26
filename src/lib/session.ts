/**
 * Session Management
 *
 * Uses iron-session for encrypted, stateless sessions stored in cookies.
 * Sessions are used for dashboard authentication only (not API keys).
 */

import { getIronSession, IronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { getEnv } from "./env";

/**
 * Session data stored in the encrypted cookie.
 */
export interface SessionData {
  isLoggedIn: boolean;
  loginAt?: number; // Unix timestamp
}

/**
 * Default session data for unauthenticated users.
 */
const defaultSession: SessionData = {
  isLoggedIn: false,
};

/**
 * Get iron-session options with environment configuration.
 */
function getSessionOptions(): SessionOptions {
  const env = getEnv();

  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required");
  }

  return {
    password: env.SESSION_SECRET,
    cookieName: "notification-hub-session",
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      maxAge: env.SESSION_TTL_HOURS * 60 * 60, // Convert hours to seconds
    },
  };
}

/**
 * Get the current session from cookies.
 * Returns a session object that can be modified and saved.
 */
export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    getSessionOptions()
  );

  // Initialize with defaults if empty
  if (!session.isLoggedIn) {
    session.isLoggedIn = defaultSession.isLoggedIn;
  }

  return session;
}

/**
 * Check if the current session is authenticated.
 * This is a convenience function for route handlers.
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const session = await getSession();
    return session.isLoggedIn === true;
  } catch {
    return false;
  }
}

/**
 * Create a new authenticated session.
 * Called after successful login.
 */
export async function createSession(): Promise<void> {
  const session = await getSession();
  session.isLoggedIn = true;
  session.loginAt = Date.now();
  await session.save();
}

/**
 * Destroy the current session.
 * Called on logout.
 */
export async function destroySession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
