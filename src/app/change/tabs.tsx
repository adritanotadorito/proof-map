"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useRef } from "react";

/**
 * Client-side tab switching for the pinned change page. The server renders every panel once,
 * from one load of the pinned change; switching only shows a different panel and updates the
 * URL, so it never repeats the GitHub reads. A refresh or direct link still renders on the
 * server with the tab taken from the URL.
 */
const ActiveTab = createContext<string>("overview");

function tabFrom(params: URLSearchParams, tabs: readonly string[]): string {
  const t = params.get("tab");
  return t && tabs.includes(t) ? t : "overview";
}

export function TabsRoot({ tabs, children }: { tabs: readonly string[]; children: React.ReactNode }) {
  // The URL is the single source of truth, so the tab also follows server redirects and Back/Forward.
  const active = tabFrom(useSearchParams(), tabs);
  const pendingHash = useRef<string | null>(null);

  useEffect(() => {
    const hash = pendingHash.current;
    pendingHash.current = null;
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: "start" });
  }, [active]);

  /** Turns clicks on in-page links to /change?tab=… into a panel switch instead of a server navigation. */
  function onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
    // Only plain tab links: anything carrying other parameters is left to the server.
    const extra = [...url.searchParams.keys()].filter((k) => k !== "tab");
    if (extra.length > 0) return;

    event.preventDefault();
    event.stopPropagation();
    const next = tabFrom(url.searchParams, tabs);
    const hash = url.hash ? decodeURIComponent(url.hash.slice(1)) : null;
    const target = `${url.pathname}${next === "overview" ? "" : `?tab=${next}`}${url.hash}`;
    if (next === active) {
      if (hash) document.getElementById(hash)?.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0 });
      window.history.replaceState(null, "", target);
      return;
    }
    pendingHash.current = hash;
    window.history.pushState(null, "", target);
    if (!hash) window.scrollTo({ top: 0 });
  }

  return (
    <ActiveTab.Provider value={active}>
      <div onClickCapture={onClickCapture} className="contents">
        {children}
      </div>
    </ActiveTab.Provider>
  );
}

export function TabLink({ id, href, children }: { id: string; href: string; children: React.ReactNode }) {
  const active = useContext(ActiveTab);
  return (
    <a href={href} className="tab" aria-current={active === id ? "page" : undefined}>
      {children}
    </a>
  );
}

/** One tab's content. Rendered on the server either way; only its visibility changes. */
export function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  const active = useContext(ActiveTab);
  return (
    <div hidden={active !== id} data-tab-panel={id}>
      {children}
    </div>
  );
}
