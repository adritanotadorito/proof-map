import { NextResponse } from "next/server";
import { exchangeCode, getGitHubConfig, getUser } from "@/lib/github";
import { consumeState } from "@/lib/oauth-state";
import { getSession, saveSession } from "@/lib/session";

/**
 * GitHub redirects here after the user authorizes the app, and also after an
 * installation when "Request user authorization (OAuth) during installation" is on.
 */
export async function GET(request: Request) {
  const config = getGitHubConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/?error=not_configured", request.url));
  }
  const home = (error: string) => NextResponse.redirect(`${config.appUrl}/?error=${error}`);
  const params = new URL(request.url).searchParams;

  if (params.get("error")) return home("access_denied");

  const code = params.get("code");
  const state = params.get("state");

  // An installation started on github.com (not from our Install link) arrives
  // without our state value. Discard that code and run a normal sign-in instead.
  if (!state && params.get("setup_action")) {
    return NextResponse.redirect(`${config.appUrl}/api/auth/github/login`);
  }

  if (!(await consumeState(state))) return home("state_mismatch");
  if (!code) return home("missing_code");

  try {
    const token = await exchangeCode(config, code);
    const user = await getUser(token.accessToken);
    const previous = await getSession();
    await saveSession({
      user,
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      // Keep the chosen repository only if the same person signed in again.
      selectedRepo: previous?.user.id === user.id ? previous.selectedRepo : null,
    });
  } catch (error) {
    console.error("GitHub sign-in failed:", error instanceof Error ? error.message : error);
    return home("sign_in_failed");
  }
  return NextResponse.redirect(`${config.appUrl}/repos`);
}
