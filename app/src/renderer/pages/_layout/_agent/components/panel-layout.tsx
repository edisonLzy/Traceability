import { cn } from "@renderer/lib/utils";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

interface PanelLayoutProps {
  children: ReactNode;
}

export function PanelLayout({ children }: PanelLayoutProps) {
  return (
    <aside
      aria-label="Traceability Agent"
      className="relative flex h-full min-w-0 flex-col bg-[rgba(18,19,23,0.75)] backdrop-blur-2xl"
    >
      {children}
    </aside>
  );
}

interface PanelHeaderProps {
  title: string;
  actions?: ReactNode;
}

export function PanelHeader({ title, actions }: PanelHeaderProps) {
  return (
    <header className="relative flex min-h-12 items-center gap-2 border-b border-hairline px-2.5">
      <span className="grid size-[27px] place-items-center rounded-[9px] bg-primary/15 text-primary-hover">
        <Sparkles size={15} />
      </span>
      <h1 className="min-w-0 flex-1 truncate px-1.5 text-[12px] font-[650] text-ink">{title}</h1>
      {actions}
    </header>
  );
}

interface PanelBodyProps {
  children: ReactNode;
  className?: string;
}

export function PanelBody({ children, className }: PanelBodyProps) {
  return <section className={cn("min-h-0 flex-1", className)}>{children}</section>;
}

interface PanelFooterProps {
  children: ReactNode;
}

export function PanelFooter({ children }: PanelFooterProps) {
  return (
    <section className="shrink-0 border-t border-hairline bg-[rgba(14,15,18,0.86)] px-2.5 py-2.5">
      {children}
    </section>
  );
}
