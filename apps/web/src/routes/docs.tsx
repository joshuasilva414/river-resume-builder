import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { Appearance } from "~/components/appearance";
import { Brand } from "~/components/brand";
import { guides } from "~/components/docs/guides";
import { guideGroups } from "~/components/docs/shared";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/docs")({
  component: Documentation,
});

function Documentation() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <div className="min-h-dvh">
      <a
        href="#docs-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-background focus:p-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-18 max-w-360 items-center justify-between gap-3 px-5 md:px-9">
          <Link to="/docs" aria-label="River documentation" className="flex items-center gap-5">
            <Brand />
            <span className="hidden border-l pl-5 text-sm text-muted-foreground sm:block">
              User guide
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Appearance />
            <Button variant="outline" size="sm" asChild>
              <Link to="/">
                Open River <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-360 lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="border-b px-5 py-4 lg:sticky lg:top-18 lg:h-[calc(100dvh-4.5rem)] lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-7 lg:py-9">
          <details key={pathname} className="group lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2">
                <BookOpen className="size-4 text-primary" />
                Browse the guide
              </span>
              <span className="text-muted-foreground group-open:hidden" aria-hidden="true">
                +
              </span>
              <span className="hidden text-muted-foreground group-open:inline" aria-hidden="true">
                −
              </span>
            </summary>
            <div className="pt-6">
              <GuideNavigation pathname={pathname} />
            </div>
          </details>
          <div className="hidden lg:block">
            <GuideNavigation pathname={pathname} />
          </div>
        </aside>
        <main
          id="docs-content"
          tabIndex={-1}
          className="min-w-0 scroll-mt-24 px-5 py-10 outline-none sm:px-9 lg:px-12 lg:py-14"
        >
          <Outlet />
          <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-xs text-muted-foreground">
            <p>River user guide · Updated September 6, 2026</p>
            <Link
              to="/docs/$slug"
              params={{ slug: "troubleshooting" }}
              className="hover:text-primary"
            >
              Need help?
            </Link>
          </footer>
        </main>
      </div>
    </div>
  );
}

function GuideNavigation({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Documentation" className="space-y-7">
      <Link
        to="/docs"
        activeOptions={{ exact: true }}
        aria-current={pathname.replace(/\/$/, "") === "/docs" ? "page" : undefined}
        className="block rounded-sm px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
        activeProps={{ className: "bg-accent font-medium text-accent-foreground" }}
      >
        Overview
      </Link>
      {guideGroups.map((group) => (
        <div key={group}>
          <p className="eyebrow mb-2 px-3">{group}</p>
          <ul className="space-y-1">
            {guides
              .filter((guide) => guide.group === group)
              .map((guide) => {
                const active = pathname.replace(/\/$/, "") === `/docs/${guide.slug}`;
                return (
                  <li key={guide.slug}>
                    <Link
                      to="/docs/$slug"
                      params={{ slug: guide.slug }}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-sm px-3 py-2 text-sm hover:bg-muted",
                        active
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {guide.title}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
