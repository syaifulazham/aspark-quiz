"use client";

import { useEffect, useState } from "react";

/** Formats a timestamp in the viewer's own time zone (the server's zone is not meaningful to them). */
export function LocalTime({ iso }: { iso: string | null }) {
  const [text, setText] = useState(() => (iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—"));
  useEffect(() => {
    if (!iso) return;
    const d = new Date(iso);
    setText(
      d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      })
    );
  }, [iso]);
  return <span suppressHydrationWarning>{text}</span>;
}
