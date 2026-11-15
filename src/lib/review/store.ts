import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { kv, kvEnabled, parse } from "../kv";
import { REVIEW_VERSION, type ReviewFailure, type ReviewRecord } from "./types";

/**
 * Review records live in the Redis record store when one is configured (see kv.ts), otherwise
 * as JSON files under .data/reviews (ignored by Git, local development only). One file per repository + base SHA + head SHA: a review belongs to exactly one pinned change.
 */
const DIR = path.join(process.cwd(), ".data", "reviews");

function fileFor(repoId: number, baseSha: string, headSha: string, suffix: string): string {
  const safe = (s: string) => s.replace(/[^0-9a-f]/gi, "").slice(0, 64);
  return path.join(DIR, `${Math.trunc(repoId)}-${safe(baseSha)}-${safe(headSha)}${suffix}`);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

const kvKey = (repoId: number, baseSha: string, headSha: string, kind: "review" | "review-error") =>
  `${kind}:${path.basename(fileFor(repoId, baseSha, headSha, ""))}`;

export async function loadReview(repoId: number, baseSha: string, headSha: string): Promise<ReviewRecord | null> {
  const record = kvEnabled()
    ? parse<ReviewRecord>((await kv(["GET", kvKey(repoId, baseSha, headSha, "review")]))[0])
    : await readJson<ReviewRecord>(fileFor(repoId, baseSha, headSha, ".json"));
  // Records written in an older shape are ignored rather than half-rendered.
  return record?.version === REVIEW_VERSION ? record : null;
}

export async function loadFailure(repoId: number, baseSha: string, headSha: string): Promise<ReviewFailure | null> {
  if (kvEnabled()) return parse<ReviewFailure>((await kv(["GET", kvKey(repoId, baseSha, headSha, "review-error")]))[0]);
  return readJson<ReviewFailure>(fileFor(repoId, baseSha, headSha, ".error.json"));
}

export async function saveReview(record: ReviewRecord): Promise<void> {
  if (kvEnabled()) {
    await kv(
      ["SET", kvKey(record.repoId, record.baseSha, record.headSha, "review"), JSON.stringify(record)],
      ["DEL", kvKey(record.repoId, record.baseSha, record.headSha, "review-error")],
      ["RPUSH", `activity:${record.requestedBy}`, JSON.stringify({ kind: "review", at: record.createdAt })],
    );
    return;
  }
  await mkdir(DIR, { recursive: true });
  await writeFile(fileFor(record.repoId, record.baseSha, record.headSha, ".json"), JSON.stringify(record, null, 2));
  await rm(fileFor(record.repoId, record.baseSha, record.headSha, ".error.json"), { force: true });
}

export async function saveFailure(repoId: number, baseSha: string, headSha: string, failure: ReviewFailure): Promise<void> {
  if (kvEnabled()) {
    await kv(["SET", kvKey(repoId, baseSha, headSha, "review-error"), JSON.stringify(failure)]);
    return;
  }
  await mkdir(DIR, { recursive: true });
  await writeFile(fileFor(repoId, baseSha, headSha, ".error.json"), JSON.stringify(failure, null, 2));
}
