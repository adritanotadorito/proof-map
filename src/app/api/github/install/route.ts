import { NextResponse } from "next/server";
import { getGitHubConfig } from "@/lib/github";
import { issueState } from "@/lib/oauth-state";

/** Sends the user to GitHub to install the app and choose repositories. */
export async function GET(request: Request) {
  const config = getGitHubConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/?error=not_configured", request.url));
  }
  const url = new URL(`https://github.com/apps/${config.slug}/installations/new`);
  url.searchParams.set("state", await issueState());
  return NextResponse.redirect(url);
}
