import { useCurrentApp } from "@renderer/context/current-app";
import { openCommandPalette } from "@renderer/lib/agent-events";
import { AppWindow } from "lucide-react";

/** Shown when no application exists yet. Prompts creating one via the switcher. */
export function NoAppState() {
  const { apps } = useCurrentApp();
  return (
    <div className="mx-auto block min-h-full max-w-[1260px] px-[22px] pt-[22px] pb-12">
      <div className="flex flex-col items-center justify-center px-5 py-20 text-center">
        <span className="mb-4 grid size-12 place-items-center rounded-2xl border border-hairline bg-white/[0.025] text-tertiary">
          <AppWindow size={22} />
        </span>
        <h2 className="m-0 text-[18px] font-[660] tracking-[-0.02em]">
          {apps.length === 0 ? "No applications yet" : "Select an application"}
        </h2>
        <p className="mt-2 max-w-[420px] text-[12px] text-tertiary">
          {apps.length === 0
            ? "Create an application to start monitoring runtime issues and performance."
            : "Choose an application from the switcher in the header to view its monitoring data."}
        </p>
        {apps.length === 0 && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("traceability:create-app"))}
            className="mt-5 inline-flex h-9 items-center gap-2 rounded-[9px] border border-primary/40 bg-primary px-4 text-[12px] font-[590] text-[#111329] transition-colors hover:bg-primary-hover"
          >
            <AppWindow size={14} /> Add application
          </button>
        )}
        {apps.length > 0 && (
          <button
            type="button"
            onClick={() => openCommandPalette("global")}
            className="mt-5 text-[12px] text-primary-hover transition-colors hover:underline"
          >
            Or switch via the command palette (⌘K)
          </button>
        )}
      </div>
    </div>
  );
}
