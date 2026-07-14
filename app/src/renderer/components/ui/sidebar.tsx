import { cn } from "@renderer/lib/utils";
import { Children, cloneElement, forwardRef, type ComponentProps, type ReactElement } from "react";

function Sidebar({ className, ...props }: ComponentProps<"aside">) {
  return (
    <aside data-slot="sidebar" className={cn("flex min-h-0 flex-col", className)} {...props} />
  );
}

function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex shrink-0 flex-col", className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("flex shrink-0 flex-col", className)}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("relative flex w-full min-w-0 flex-col", className)}
      {...props}
    />
  );
}

function SidebarGroupContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sidebar-group-content" className={cn("w-full", className)} {...props} />;
}

function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("flex w-full min-w-0 flex-col", className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

type SidebarMenuButtonProps = ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
};

const SidebarMenuButton = forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ asChild = false, children, className, isActive = false, ...props }, ref) => {
    const styles = cn(
      "peer/menu-button flex w-full items-center justify-center rounded-[10px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
      className,
    );

    if (asChild) {
      const child = Children.only(children) as ReactElement<{
        className?: string;
        "data-active"?: boolean;
        "data-slot"?: string;
      }>;
      return cloneElement(child, {
        "data-active": isActive,
        "data-slot": "sidebar-menu-button",
        className: cn(styles, child.props.className),
      });
    }

    return (
      <button
        ref={ref}
        data-active={isActive}
        data-slot="sidebar-menu-button"
        className={styles}
        {...props}
      >
        {children}
      </button>
    );
  },
);

SidebarMenuButton.displayName = "SidebarMenuButton";

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
};
