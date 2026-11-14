import { NextResponse } from "next/server";
import { callbackUrl, getGitHubConfig } from "@/lib/github";
import { issueState } from "@/lib/oauth-state";

/** Starts GitHub App user authorization. */
export async function GET(request: Request) {
  const config = getGitHubConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/?error=not_configured", request.url));
  }
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", callbackUrl(config));
  url.searchParams.set("state", await issueState());
  return NextResponse.redirect(url);
}
