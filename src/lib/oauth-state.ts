import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { STATE_COOKIE, cookieOptions } from "./session";

/** Creates a one-time anti-CSRF value and remembers it in an httpOnly cookie. */
export async function issueState(): Promise<string> {
  const state = randomBytes(32).toString("hex");
  (await cookies()).set(STATE_COOKIE, state, { ...cookieOptions, maxAge: 600 });
  return state;
}

/** Checks the value GitHub sent back against the cookie, then discards the cookie. */
export async function consumeState(returned: string | null): Promise<boolean> {
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  if (!expected || !returned) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(returned);
  return a.length === b.length && timingSafeEqual(a, b);
}
