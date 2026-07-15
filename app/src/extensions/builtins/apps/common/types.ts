import type { Application } from "@traceability/protocol";

export const APPS_LIST_TOOL = "apps/list";
export const APPS_LIST_BLOCK_TYPE = "apps.list";

export interface AppsListBlockProps {
  apps: Application[];
}
