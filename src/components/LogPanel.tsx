"use client";

import { useEffect, useRef } from "react";
import type { LogEntry } from "@/client/useBridgeOperation";

function hhmmss(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
}

export function LogPanel({ log }: { log: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log]);

  return (
    <div className="log" ref={ref}>
      {log.length === 0 ? (
        <div className="line ts">Activity will appear here.</div>
      ) : (
        log.map((l, i) => (
          <div className="line" key={i}>
            <span className="ts">[{hhmmss(l.ts)}] </span>
            <span className={l.level}>{l.msg}</span>
          </div>
        ))
      )}
    </div>
  );
}
