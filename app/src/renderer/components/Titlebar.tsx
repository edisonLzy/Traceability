import { Fingerprint, Minus, Square, X } from "lucide-react";
import type { ReactNode } from "react";

const isMac = /Mac/i.test(navigator.userAgent);

export function Titlebar() {
  return (
    <header className="app-drag fixed inset-x-0 top-0 z-30 flex h-[30px] items-center border-b border-hairline bg-[rgba(12,13,16,0.72)] px-3 backdrop-blur-xl">
      <div className={`app-no-drag flex items-center gap-1.5 ${isMac ? "pl-[72px]" : ""}`}>
        <Fingerprint size={15} className="text-primary-hover" />
        <span className="text-[12px] font-[560] tracking-[0.01em] text-tertiary">Traceability</span>
      </div>
      <div className="app-no-drag ml-auto flex gap-0.5">
        {!isMac && (
          <>
            <WindowButton
              title="Minimize"
              onClick={() => void window.traceability.window.minimize()}
            >
              <Minus size={14} />
            </WindowButton>
            <WindowButton
              title="Maximize"
              onClick={() => void window.traceability.window.toggleMaximize()}
            >
              <Square size={11} />
            </WindowButton>
            <WindowButton title="Close" onClick={() => void window.traceability.window.close()}>
              <X size={14} />
            </WindowButton>
          </>
        )}
      </div>
    </header>
  );
}

function WindowButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-[7px] text-tertiary transition-colors hover:bg-white/10 hover:text-ink"
    >
      {children}
    </button>
  );
}
