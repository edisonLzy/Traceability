import { cn } from "@renderer/lib/utils";
import { NavLink } from "react-router-dom";

const navItemClass =
  "flex h-9 w-auto items-center gap-2.5 rounded-md px-2 text-left text-subtle transition-colors hover:bg-surface-1 hover:text-muted tablet:w-full";

export function Sidebar() {
  return (
    <aside className="sticky top-0 z-10 flex h-auto flex-row items-center gap-2.5 border-b border-hairline bg-[#070708] px-2.5 py-1.5 tablet:static tablet:h-screen tablet:flex-col tablet:items-stretch tablet:gap-0 tablet:border-b-0 tablet:border-r tablet:border-hairline tablet:px-3 tablet:py-3.5">
      <div className="flex h-10.5 m-0 items-center gap-2.5 px-2 text-sm font-semibold tracking-[-0.3px] tablet:mb-3">
        <span className="grid size-6 place-items-center rounded-md bg-primary text-xs font-bold text-white shadow-[inset_0_1px_rgb(255_255_255_/_0.18)]">
          T
        </span>
        <span>Traceability</span>
      </div>
      <div className="hidden mb-4.5 items-center gap-2.5 rounded-lg border border-hairline bg-surface-1 p-2 tablet:flex">
        <div className="grid size-6.5 place-items-center rounded-md bg-[#292b31] text-[11px] font-semibold text-muted">
          FE
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">Frontend Platform</div>
          <div className="text-[11px] text-subtle">Engineering</div>
        </div>
        <span className="text-subtle">⌄</span>
      </div>
      <nav className="flex ml-auto tablet:ml-0 tablet:block">
        <div className="hidden my-1.5 px-2 text-[11px] uppercase tracking-[0.06em] text-tertiary tablet:block">
          Workspace
        </div>
        <NavLink
          to="/issues"
          className={({ isActive }) => cn(navItemClass, isActive && "bg-surface-2 text-ink")}
        >
          <span className="w-4.5 text-center text-xs">◇</span>Issues
        </NavLink>
        <NavLink
          to="/apps"
          className={({ isActive }) => cn(navItemClass, isActive && "bg-surface-2 text-ink")}
        >
          <span className="w-4.5 text-center text-xs">▦</span>Applications
        </NavLink>
        <NavLink
          to="/performance"
          className={({ isActive }) => cn(navItemClass, isActive && "bg-surface-2 text-ink")}
        >
          <span className="w-4.5 text-center text-xs">◴</span>Performance
        </NavLink>
        <div className="hidden my-1.5 px-2 text-[11px] uppercase tracking-[0.06em] text-tertiary tablet:block">
          Manage
        </div>
        <NavLink
          to="/settings"
          className={({ isActive }) => cn(navItemClass, isActive && "bg-surface-2 text-ink")}
        >
          <span className="w-4.5 text-center text-xs">⌁</span>SDK setup
        </NavLink>
      </nav>
      <div className="hidden mt-auto tablet:block">
        <div className="flex items-center gap-2.5 border-t border-hairline px-2 py-2">
          <div className="grid size-7 place-items-center rounded-md bg-[#292b31] text-[11px] font-semibold text-muted">
            LY
          </div>
          <div className="min-w-0">
            <div className="text-xs">研发</div>
            <div className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-subtle">
              dev@local
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
