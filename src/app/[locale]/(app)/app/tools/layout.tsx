import { ReactNode } from "react";

/**
 * Shared layout for all /app/tools/* pages.
 * Currently a pass-through — the parent app layout already provides
 * sidebar, auth guard, JobPollingProvider, and ProcessingModal.
 *
 * In the future, this can add a back-to-dashboard breadcrumb
 * or a shared tool page header.
 */
export default function ToolsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
