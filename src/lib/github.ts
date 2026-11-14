import "server-only";

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
    appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  };
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

async function gh<T>(token: string, path: string): Promise<T> {
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
      });
    }
    if (repos.length >= data.total_count || data.repositories.length === 0) break;
  }
  return repos;
}
