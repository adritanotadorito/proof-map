"use client";

import { useEffect } from "react";

/** Scrolls a line into view once the streamed source has arrived. */
export function ScrollToLine({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [id]);
  return null;
}
