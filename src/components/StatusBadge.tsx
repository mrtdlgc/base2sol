"use client";

import type { ExecutionStatus } from "bridge-sdk";

const CLASS: Record<ExecutionStatus["type"], string> = {
  Unknown: "badge",
  Initiated: "badge live",
  Executable: "badge live",
  Executing: "badge live",
  Executed: "badge live",
  Failed: "badge err",
  Expired: "badge err",
};

const LABEL: Record<ExecutionStatus["type"], string> = {
  Unknown: "Unknown",
  Initiated: "Waiting",
  Executable: "Ready to execute",
  Executing: "Executing",
  Executed: "Complete",
  Failed: "Failed",
  Expired: "Expired",
};

export function StatusBadge({ status }: { status: ExecutionStatus | null }) {
  if (!status) return <span className="badge">Ready</span>;
  return (
    <span className={CLASS[status.type]}>
      <span className="dot" />
      {LABEL[status.type]}
    </span>
  );
}
