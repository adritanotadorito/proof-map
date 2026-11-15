import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { kv, kvEnabled, parse } from "./kv";

/**
 * What one signed-in person has actually recorded in ProofMap, per UTC day: AI reviews they
 * requested and decisions they signed. Read from the same local records the change page uses,
 * so the activity panel never shows anything that has no record behind it.
 */
export type Activity = { days: Record<string, number>; reviews: number; decisions: number };

const DATA = path.join(process.cwd(), ".data");

async function readAll(dir: string, skip: (name: string) => boolean): Promise<unknown[]> {
  let names: string[];
  try {
    names = await readdir(path.join(DATA, dir));
  } catch {
    return [];
  }
  const files = names.filter((n) => n.endsWith(".json") && !skip(n));
  return Promise.all(
    files.map(async (n) => {
      try {
        return JSON.parse(await readFile(path.join(DATA, dir, n), "utf8")) as unknown;
      } catch {
        return null;
      }
    }),
  );
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export async function loadActivity(login: string, sinceIso: string): Promise<Activity> {
  const activity: Activity = { days: {}, reviews: 0, decisions: 0 };
  const count = (at: unknown): boolean => {
    if (typeof at !== "string" || at < sinceIso) return false;
    const day = at.slice(0, 10);
    activity.days[day] = (activity.days[day] ?? 0) + 1;
    return true;
  };
  if (kvEnabled()) {
    const [entries] = await kv(["LRANGE", `activity:${login}`, 0, -1]);
    for (const v of Array.isArray(entries) ? entries : []) {
      const e = parse<{ kind?: string; at?: string }>(v);
      if (e && count(e.at)) {
        if (e.kind === "review") activity.reviews++;
        else if (e.kind === "decision") activity.decisions++;
      }
    }
    return activity;
  }
  const [reviews, decisionLists] = await Promise.all([
    readAll("reviews", (n) => n.endsWith(".error.json")),
    readAll("decisions", () => false),
  ]);
  for (const r of reviews) {
    if (isRecord(r) && r.requestedBy === login && count(r.createdAt)) activity.reviews++;
  }
  for (const list of decisionLists) {
    if (!Array.isArray(list)) continue;
    for (const d of list) {
      if (isRecord(d) && isRecord(d.user) && d.user.login === login && count(d.at)) activity.decisions++;
    }
  }
  return activity;
}
