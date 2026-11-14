import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";

/**
 * Stateless session: the payload is AES-256-GCM encrypted with SESSION_SECRET
 * and kept in an httpOnly cookie. The GitHub user token lives only inside this
 * encrypted cookie; it is never sent to client-side JavaScript or stored on disk.
 */

export const SESSION_COOKIE = "pm_session";
export const STATE_COOKIE = "pm_oauth_state";

export type SelectedRepo = {
  id: number;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  defaultBranch: string;
  installationId: number;
  selectedAt: string;
};

/** The exact change under review. Everything shown later is read at these two SHAs. */
export type PinnedTarget = {
  kind: "branch" | "pr";
  /** Branch name, or the pull request's head branch name. */
  ref: string;
  prNumber: number | null;
  prTitle: string | null;
  baseSha: string;
  headSha: string;
  /** How the base was chosen, in plain words, shown to the reviewer. */
  baseRule: string;
  pinnedAt: string;
};

export type Session = {
  user: { id: number; login: string; name: string | null };
  accessToken: string;
  /** Epoch milliseconds. GitHub App user tokens expire (8 hours by default). */
  expiresAt: number;
  selectedRepo: SelectedRepo | null;
  target: PinnedTarget | null;
};

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or shorter than 32 characters.");
  }
  return createHash("sha256").update(secret).digest();
}

export function seal(session: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unsealJson<T>(value: string): T | null {
  try {
    const raw = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    // Tampered, truncated, or encrypted with a different secret.
    return null;
  }
}

export function unseal(value: string): Session | null {
  const session = unsealJson<Session>(value);
  if (!session?.accessToken || session.expiresAt <= Date.now()) return null;
  // Sessions created before a field existed simply lack it.
  return { ...session, selectedRepo: session.selectedRepo ?? null, target: session.target ?? null };
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function getSession(): Promise<Session | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  // Expiry is checked against the clock, so this must run at request time, never in a prerender.
  await connection();
  return unseal(value);
}

/** Only callable from a Route Handler or Server Function. */
export async function saveSession(session: Session): Promise<void> {
  const maxAge = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
  (await cookies()).set(SESSION_COOKIE, seal(session), { ...cookieOptions, maxAge });
}

/** Only callable from a Route Handler or Server Function. */
export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
