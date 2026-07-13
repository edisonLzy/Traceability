import type { Issue, IssueStatus } from "@traceability/protocol";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "18 sec ago", "4 min ago", "2 hr ago", "1 day ago", else locale date. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

/** Display-ready source location for an issue's origin frame. */
export function issueSource(issue: Issue): string {
  const src = issue.metadata.source;
  if (src) return `${src.file}:${src.line}`;
  if (issue.metadata.frames?.[0]) {
    const frame = issue.metadata.frames[0];
    return `${frame.file}:${frame.line}`;
  }
  return issue.metadata.message ?? issue.fingerprint.slice(0, 12);
}

export type StatusGroup = "open" | "investigating" | "fixed";

export function statusGroup(status: IssueStatus): StatusGroup {
  if (status === "open") return "open";
  if (status === "fixed") return "fixed";
  return "investigating"; // fix-manual | fixing | ignored
}

export function statusLabel(status: IssueStatus): string {
  const group = statusGroup(status);
  return group === "open" ? "Open" : group === "fixed" ? "Fixed" : "Investigating";
}
