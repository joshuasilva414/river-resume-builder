import { Link, useLocation } from "@tanstack/react-router";
import {
  Activity,
  BriefcaseBusiness,
  FileCheck,
  FileText,
  Layers,
  LogOut,
  MessageSquare,
  PanelsTopLeft,
  Settings,
  Shield,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Appearance } from "~/components/appearance";
import { Brand } from "~/components/brand";
import { TrashFeedbackProvider } from "~/components/trash/actions";
import { Button } from "~/components/ui/button";
import { authClient } from "~/lib/auth-client";
import { cn } from "~/lib/utils";

const navigation = [
  { to: "/jobs", label: "Job targets", icon: BriefcaseBusiness },
  { to: "/evidence", label: "Evidence bank", icon: FileCheck },
  { to: "/library", label: "Content library", icon: Layers },
  { to: "/templates", label: "Templates", icon: PanelsTopLeft },
  { to: "/sources", label: "Sources", icon: FileText },
  { to: "/trash", label: "Trash", icon: Trash2 },
  { to: "/admin", label: "Administration", icon: Shield },
  { to: "/runtime", label: "Document runtime", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;
export function WorkspaceShell({
  user,
  environment,
  children,
  mobileFocus = false,
  contained = false,
}: {
  user: { name: string; email: string; isAdmin: boolean };
  environment: string;
  children: ReactNode;
  mobileFocus?: boolean;
  contained?: boolean;
}) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const visibleNavigation = navigation.filter(
    (item) =>
      (item.to !== "/admin" || user.isAdmin) &&
      (item.to !== "/runtime" || (user.isAdmin && environment !== "production")),
  );
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <div className={cn("flex min-h-dvh flex-col", contained && "xl:h-dvh xl:overflow-hidden")}>
      <TrashFeedbackProvider>
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-5 sm:gap-6 md:px-6">
          <Link to="/" className="md:w-60">
            <Brand />
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <Link
              to="/feedback"
              aria-current={pathname === "/feedback" ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 min-w-9 items-center justify-center gap-2 text-sm hover:text-primary",
                pathname === "/feedback" ? "text-primary" : "text-muted-foreground",
              )}
            >
              <MessageSquare className="size-4 sm:hidden" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Feedback</span>
            </Link>
            <Link to="/docs" className="text-sm text-muted-foreground hover:text-primary">
              User guide
            </Link>
            <Appearance />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={async () => {
                const result = await authClient.signOut();
                if (result.error) setFailure("Unable to sign out. Try again.");
                else window.location.assign("/sign-in");
              }}
            >
              <LogOut />
            </Button>
            <span
              className="hidden size-8 items-center justify-center rounded-full border font-medium sm:flex"
              title={user.email}
            >
              {user.name.slice(0, 1)}
            </span>
          </div>
        </header>
        {failure && (
          <p role="alert" className="border-b p-3 text-destructive">
            {failure}
          </p>
        )}
        <nav
          aria-label="Workspace"
          className={cn(
            "flex gap-1 overflow-x-auto border-b px-4 py-2 md:hidden",
            mobileFocus && "hidden",
          )}
        >
          {visibleNavigation.map((item) => (
            <Button
              key={item.to}
              variant={
                pathname === item.to || (item.to === "/jobs" && pathname.startsWith("/jobs/"))
                  ? "secondary"
                  : "ghost"
              }
              size="sm"
              asChild
            >
              <Link
                to={item.to}
                aria-current={
                  pathname === item.to || (item.to === "/jobs" && pathname.startsWith("/jobs/"))
                    ? "page"
                    : undefined
                }
              >
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-51 shrink-0 flex-col border-r px-4 py-6 md:flex">
            <p className="eyebrow px-2 pb-4">Workspace</p>
            <nav aria-label="Workspace" className="flex flex-col gap-1">
              {visibleNavigation.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={
                    pathname === item.to || (item.to === "/jobs" && pathname.startsWith("/jobs/"))
                      ? "page"
                      : undefined
                  }
                  className={cn(
                    "flex items-center gap-3 rounded-sm px-3 py-2 text-[13px]",
                    pathname === item.to || (item.to === "/jobs" && pathname.startsWith("/jobs/"))
                      ? "bg-accent font-semibold text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-2 border-t px-2 pt-5">
              <span className="text-[13px] font-medium">{user.name}</span>
              {/* <span className="text-xs text-muted-foreground">Private workspace</span>
            <span className="eyebrow pt-3">{environment}</span> */}
            </div>
          </aside>
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
        </div>
      </TrashFeedbackProvider>
    </div>
  );
}
