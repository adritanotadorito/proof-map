import "server-only";

/**
 * Durable record store for deployments. Uses Upstash Redis over its REST API (plain fetch, no
 * extra dependency). Vercel's Upstash integration sets KV_REST_API_URL / KV_REST_API_TOKEN;
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN also work.
 *
 * When neither is set, callers fall back to local JSON files under .data (development only).
 * On Vercel the filesystem does not persist, so a missing store is an error there, never silent loss.
 */
function config(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function kvEnabled(): boolean {
  if (config()) return true;
  if (process.env.VERCEL) {
    throw new Error("No persistent store configured: set KV_REST_API_URL and KV_REST_API_TOKEN (Upstash Redis).");
  }
  return false;
}

type Command = (string | number)[];

/** Runs commands in one round trip and returns each result. */
export async function kv(...commands: Command[]): Promise<unknown[]> {
  const c = config();
  if (!c) throw new Error("Persistent store is not configured.");
  const res = await fetch(`${c.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands.map((cmd) => cmd.map(String))),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Record store returned ${res.status}.`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  return out.map((r) => {
    if (r.error) throw new Error(`Record store error: ${r.error}`);
    return r.result;
  });
}

export function parse<T>(value: unknown): T | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
