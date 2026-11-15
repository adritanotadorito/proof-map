import "server-only";
import { createHash } from "node:crypto";

const API = "https://api.github.com";

export type GitHubConfig = {
  clientId: string;
  clientSecret: string;
  slug: string;
  appUrl: string;
};

/** Returns null when the GitHub App has not been configured in .env.local yet. */
export function getGitHubConfig(): GitHubConfig | null {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  const slug = process.env.GITHUB_APP_SLUG;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!clientId || !clientSecret || !slug || !sessionSecret) return null;
  return {
    clientId,
    clientSecret,
    slug,
    appUrl: appUrl(),
  };
}

/** APP_URL wins; on Vercel the production domain is the fallback; localhost only in development. */
function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export function callbackUrl(config: GitHubConfig): string {
  return `${config.appUrl}/api/auth/github/callback`;
}

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Counts real requests to GitHub, so page loads can report how many they made. */
let requestCount = 0;
export const gitHubRequestCount = () => requestCount;

/**
 * Remembers answers that cannot change: anything addressed by a full commit SHA.
 * Entries are kept per access token, so one person's answers are never served to another,
 * and nothing mutable (branch heads, issues, repository settings) is ever stored here.
 */
const IMMUTABLE_TTL_MS = 30 * 60 * 1000;
const IMMUTABLE_MAX = 300;
const immutableCache = new Map<string, { at: number; value: unknown }>();
const isSha = (s: string) => /^[0-9a-f]{40}$/i.test(s);

function cacheKey(token: string, path: string): string {
  return `${createHash("sha256").update(token).digest("hex").slice(0, 24)}:${path}`;
}

async function gh<T>(token: string, path: string): Promise<T> {
  requestCount++;
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new GitHubError(res.status, `GitHub ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

export type TokenResult = { accessToken: string; expiresAt: number };

/** Exchanges the one-time OAuth code for a user access token. Server-side only. */
export async function exchangeCode(config: GitHubConfig, code: string): Promise<TokenResult> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: callbackUrl(config),
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new GitHubError(res.status, `Token exchange failed: ${data.error ?? "unknown"}`);
  }
  // Tokens without an expiry (expiration disabled on the app) still get an 8 hour session.
  const lifetimeSeconds = data.expires_in ?? 8 * 60 * 60;
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + lifetimeSeconds * 1000,
  };
}

export type GitHubUser = { id: number; login: string; name: string | null };

export async function getUser(token: string): Promise<GitHubUser> {
  const u = await gh<GitHubUser>(token, "/user");
  return { id: u.id, login: u.login, name: u.name };
}

export type Installation = {
  id: number;
  accountLogin: string;
  accountType: string;
  repositorySelection: "all" | "selected";
  manageUrl: string;
};

/** Installations of this app that the signed-in user can access. */
export async function listInstallations(token: string): Promise<Installation[]> {
  const data = await gh<{
    installations: {
      id: number;
      account: { login: string; type: string } | null;
      repository_selection: "all" | "selected";
      html_url: string;
    }[];
  }>(token, "/user/installations?per_page=100");
  return data.installations.map((i) => ({
    id: i.id,
    accountLogin: i.account?.login ?? "unknown",
    accountType: i.account?.type ?? "unknown",
    repositorySelection: i.repository_selection,
    manageUrl: i.html_url,
  }));
}

export type Repo = {
  id: number;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  language: string | null;
  stars: number;
  fork: boolean;
  /** Last push, as GitHub reports it. */
  pushedAt: string | null;
  ownerId: number;
};

/**
 * Repositories in one installation that the signed-in user can access.
 * GitHub answers with the user's token, so an installation the user cannot
 * access returns an error instead of data: the installation id is never trusted on its own.
 */
export async function listInstallationRepos(token: string, installationId: number): Promise<Repo[]> {
  const repos: Repo[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await gh<{
      total_count: number;
      repositories: {
        id: number;
        full_name: string;
        html_url: string;
        private: boolean;
        default_branch: string;
        description: string | null;
        language: string | null;
        stargazers_count: number;
        fork: boolean;
        pushed_at: string | null;
        owner: { id: number };
      }[];
    }>(token, `/user/installations/${installationId}/repositories?per_page=100&page=${page}`);
    for (const r of data.repositories) {
      repos.push({
        id: r.id,
        fullName: r.full_name,
        htmlUrl: r.html_url,
        private: r.private,
        defaultBranch: r.default_branch,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        fork: r.fork,
        pushedAt: r.pushed_at,
        ownerId: r.owner.id,
      });
    }
    if (repos.length >= data.total_count || data.repositories.length === 0) break;
  }
  return repos;
}

/* ------------------------------------------------------------------ */
/* Branches, pull requests, commits, diffs and issues                  */
/* ------------------------------------------------------------------ */

/** Like gh(), but answers null when GitHub says the thing does not exist or is not visible. */
async function ghMaybe<T>(token: string, path: string, immutable = false): Promise<T | null> {
  const key = immutable ? cacheKey(token, path) : null;
  if (key) {
    const hit = immutableCache.get(key);
    if (hit && Date.now() - hit.at < IMMUTABLE_TTL_MS) return hit.value as T | null;
  }
  let value: T | null;
  try {
    value = await gh<T>(token, path);
  } catch (e) {
    if (e instanceof GitHubError && [404, 410, 422, 451].includes(e.status)) value = null;
    else throw e;
  }
  if (key) {
    if (immutableCache.size >= IMMUTABLE_MAX) immutableCache.delete(immutableCache.keys().next().value!);
    immutableCache.set(key, { at: Date.now(), value });
  }
  return value;
}

const enc = encodeURIComponent;

export type RepoInfo = {
  id: number;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  isFork: boolean;
  parent: string | null;
  source: string | null;
};

export async function getRepoInfo(token: string, fullName: string): Promise<RepoInfo | null> {
  const r = await ghMaybe<{
    id: number;
    full_name: string;
    html_url: string;
    default_branch: string;
    fork: boolean;
    parent?: { full_name: string };
    source?: { full_name: string };
  }>(token, `/repos/${fullName}`);
  if (!r) return null;
  return {
    id: r.id,
    fullName: r.full_name,
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch,
    isFork: r.fork,
    parent: r.parent?.full_name ?? null,
    source: r.source?.full_name ?? null,
  };
}

export type Branch = { name: string; sha: string };

export async function listBranches(token: string, fullName: string): Promise<Branch[]> {
  const branches: Branch[] = [];
  for (let page = 1; page <= 5; page++) {
    const data = await gh<{ name: string; commit: { sha: string } }[]>(
      token,
      `/repos/${fullName}/branches?per_page=100&page=${page}`,
    );
    branches.push(...data.map((b) => ({ name: b.name, sha: b.commit.sha })));
    if (data.length < 100) break;
  }
  return branches;
}

export async function getBranch(token: string, fullName: string, name: string): Promise<Branch | null> {
  const b = await ghMaybe<{ name: string; commit: { sha: string } }>(
    token,
    `/repos/${fullName}/branches/${enc(name)}`,
  );
  return b ? { name: b.name, sha: b.commit.sha } : null;
}

export type Pull = {
  number: number;
  title: string;
  body: string | null;
  htmlUrl: string;
  author: string;
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
};

type RawPull = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: { login: string } | null;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
};

const toPull = (p: RawPull): Pull => ({
  number: p.number,
  title: p.title,
  body: p.body,
  htmlUrl: p.html_url,
  author: p.user?.login ?? "unknown",
  headRef: p.head.ref,
  headSha: p.head.sha,
  baseRef: p.base.ref,
  baseSha: p.base.sha,
});

export async function listOpenPulls(token: string, fullName: string): Promise<Pull[]> {
  const data = await gh<RawPull[]>(token, `/repos/${fullName}/pulls?state=open&per_page=100`);
  return data.map(toPull);
}

export async function getPull(token: string, fullName: string, number: number): Promise<Pull | null> {
  const p = await ghMaybe<RawPull>(token, `/repos/${fullName}/pulls/${number}`);
  return p ? toPull(p) : null;
}

export type CommitSummary = {
  sha: string;
  parents: string[];
  authorName: string;
  authorLogin: string | null;
  date: string;
  message: string;
  htmlUrl: string;
};

export type ChangedFile = {
  filename: string;
  previousFilename: string | null;
  status: string;
  additions: number;
  deletions: number;
  /** Absent when GitHub omits it: binary files and very large diffs. */
  patch: string | null;
};

type RawCommit = {
  sha: string;
  html_url: string;
  parents: { sha: string }[];
  author: { login: string } | null;
  commit: { message: string; author: { name: string; date: string } | null };
};

type RawFile = {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

const toCommit = (c: RawCommit): CommitSummary => ({
  sha: c.sha,
  parents: c.parents.map((p) => p.sha),
  authorName: c.commit.author?.name ?? "unknown",
  authorLogin: c.author?.login ?? null,
  date: c.commit.author?.date ?? "",
  message: c.commit.message,
  htmlUrl: c.html_url,
});

const toFile = (f: RawFile): ChangedFile => ({
  filename: f.filename,
  previousFilename: f.previous_filename ?? null,
  status: f.status,
  additions: f.additions,
  deletions: f.deletions,
  patch: f.patch ?? null,
});

export type Comparison = {
  status: string;
  aheadBy: number;
  behindBy: number;
  totalCommits: number;
  mergeBaseSha: string;
  /** Oldest first. GitHub returns at most 250 here. */
  commits: CommitSummary[];
  /** GitHub returns at most 300 files. */
  files: ChangedFile[];
};

/** Three-dot comparison: what `head` adds since it diverged from `base`. Accepts branch names or SHAs. */
export async function compare(
  token: string,
  fullName: string,
  base: string,
  head: string,
): Promise<Comparison | null> {
  const r = await ghMaybe<{
    status: string;
    ahead_by: number;
    behind_by: number;
    total_commits: number;
    merge_base_commit: { sha: string };
    commits: RawCommit[];
    files?: RawFile[];
  }>(token, `/repos/${fullName}/compare/${enc(base)}...${enc(head)}?per_page=100`, isSha(base) && isSha(head));
  if (!r) return null;
  return {
    status: r.status,
    aheadBy: r.ahead_by,
    behindBy: r.behind_by,
    totalCommits: r.total_commits,
    mergeBaseSha: r.merge_base_commit.sha,
    commits: r.commits.map(toCommit),
    files: (r.files ?? []).map(toFile),
  };
}

export async function getCommit(token: string, fullName: string, sha: string): Promise<CommitSummary | null> {
  const c = await ghMaybe<RawCommit>(token, `/repos/${fullName}/commits/${enc(sha)}`, isSha(sha));
  return c ? toCommit(c) : null;
}

export async function getReadme(token: string, fullName: string, ref: string): Promise<string | null> {
  const r = await ghMaybe<{ content: string; encoding: string }>(
    token,
    `/repos/${fullName}/readme?ref=${enc(ref)}`,
    isSha(ref),
  );
  if (!r || r.encoding !== "base64") return null;
  return Buffer.from(r.content, "base64").toString("utf8");
}

export type Issue = {
  number: number;
  title: string;
  body: string;
  state: string;
  htmlUrl: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  isPullRequest: boolean;
};

export async function getIssue(token: string, fullName: string, number: number): Promise<Issue | null> {
  const i = await ghMaybe<{
    number: number;
    title: string;
    body: string | null;
    state: string;
    html_url: string;
    user: { login: string } | null;
    created_at: string;
    updated_at: string;
    pull_request?: unknown;
  }>(token, `/repos/${fullName}/issues/${number}`);
  if (!i) return null;
  return {
    number: i.number,
    title: i.title,
    body: i.body ?? "",
    state: i.state,
    htmlUrl: i.html_url,
    author: i.user?.login ?? "unknown",
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    isPullRequest: i.pull_request !== undefined,
  };
}

/**
 * A text file's content at an exact commit. Null when the path does not exist there,
 * is a directory, or is too large for GitHub's contents API (over 1 MB).
 */
export async function getFileAtRef(
  token: string,
  fullName: string,
  path: string,
  sha: string,
): Promise<string | null> {
  if (!path || path.includes("..") || path.startsWith("/")) return null;
  const encoded = path.split("/").map(enc).join("/");
  const r = await ghMaybe<{ type?: string; content?: string; encoding?: string } | unknown[]>(
    token,
    `/repos/${fullName}/contents/${encoded}?ref=${enc(sha)}`,
    isSha(sha),
  );
  if (!r || Array.isArray(r) || r.type !== "file" || r.encoding !== "base64" || r.content === undefined) {
    return null;
  }
  const text = Buffer.from(r.content, "base64").toString("utf8");
  // A NUL byte means binary content, which has no meaningful line numbers.
  return text.includes("\u0000") ? null : text;
}
