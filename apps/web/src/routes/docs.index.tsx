import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { guides } from "~/components/docs/guides";
import { guideGroups } from "~/components/docs/shared";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/docs/")({
  head: () => ({
    meta: [
      { title: "River documentation" },
      {
        name: "description",
        content:
          "A practice tutorial, task guides, reference, and explanations for building and exporting résumés with River.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: Overview,
});

const groupDescriptions = {
  Tutorials: "Complete a guided example with fictional content.",
  "How-to guides": "Follow the steps for a specific task in your workspace.",
  Reference: "Look up supported formats, fields, states, and limits.",
  Explanation: "Understand how River connects evidence, content, and saved versions.",
} satisfies Record<(typeof guideGroups)[number], string>;

function Overview() {
  return (
    <div className="max-w-240">
      <p className="eyebrow mb-5 text-primary">User guide</p>
      <h1 className="max-w-180 font-editorial text-[42px] leading-[1.08] sm:text-6xl">
        River documentation
      </h1>
      <p className="mt-6 max-w-155 text-lg leading-8 text-muted-foreground">
        River helps you reuse your experience and tailor a résumé to a job posting. These guides
        cover source material, evidence, résumé composition, review, and export.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-5">
        <Button asChild>
          <Link to="/docs/$slug" params={{ slug: "quick-start" }}>
            Start the practice tutorial <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Link
          to="/docs/$slug"
          params={{ slug: "account" }}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-primary"
        >
          Access your workspace
        </Link>
      </div>
      <p className="mt-6 max-w-155 text-sm leading-6 text-muted-foreground">
        Documentation is public. River accounts are available by invitation, and each workspace is
        private.
      </p>
      <div className="mt-12 space-y-12">
        {guideGroups.map((group) => (
          <section
            key={group}
            aria-labelledby={`group-${group.toLowerCase().replaceAll(" ", "-")}`}
          >
            <h2
              id={`group-${group.toLowerCase().replaceAll(" ", "-")}`}
              className="font-editorial text-3xl"
            >
              {group}
            </h2>
            <p className="mt-3 text-muted-foreground">{groupDescriptions[group]}</p>
            <div className="mt-6 grid gap-x-9 sm:grid-cols-2">
              {guides
                .filter((guide) => guide.group === group)
                .map((guide) => (
                  <Link
                    key={guide.slug}
                    to="/docs/$slug"
                    params={{ slug: guide.slug }}
                    className="group border-t py-6"
                  >
                    <h3 className="flex items-center justify-between gap-4 font-sans text-base font-medium tracking-normal group-hover:text-primary">
                      {guide.title}
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                    </h3>
                    <p className="mt-2 max-w-96 text-sm leading-6 text-muted-foreground">
                      {guide.description}
                    </p>
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
