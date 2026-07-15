import type { Issue } from "@traceability/protocol";

export const ISSUES_LIST_TOOL = "issues/list";
export const ISSUES_GET_TOOL = "issues/get";
export const ISSUES_LIST_BLOCK_TYPE = "issues.list";

export interface IssuesListBlockProps {
  issues: Issue[];
  appId: string;
  nextCursor: string | null;
}
