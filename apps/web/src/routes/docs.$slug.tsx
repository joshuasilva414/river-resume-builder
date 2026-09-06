import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { guides } from "~/components/docs/guides";

export const Route = createFileRoute("/docs/$slug")({
  loader: ({ params }) => {
    const index = guides.findIndex((guide) => guide.slug === params.slug);
    if (index === -1) throw notFound();
    return { index };
  },
  head: ({ loaderData }) => {
    const guide = loaderData ? guides[loaderData.index] : undefined;
    return {
      meta: [
        { title: guide ? `${guide.title} · River documentation` : "Guide not found · River" },
        {
          name: "description",
          content: guide?.description ?? "Find help using River in the user guide.",
        },
        { name: "robots", content: guide ? "index, follow" : "noindex, nofollow" },
      ],
    };
  },
  component: GuidePage,
  notFoundComponent: () => (
    <div className="max-w-xl space-y-5">
      <h1 className="page-heading">Guide not found</h1>
      <p className="text-muted-foreground">
        This guide does not exist. Browse the documentation to find the task you need.
      </p>
      <Link to="/docs" className="text-primary underline">
        Return to the guide
      </Link>
    </div>
  ),
});

function GuidePage() {
  const { index } = Route.useLoaderData();
  const guide = guides[index];
  if (!guide) return null;
  const previous = guides[index - 1];
  const next = guides[index + 1];
  return (
    <div className="grid items-start gap-12 xl:grid-cols-[minmax(0,680px)_minmax(140px,1fr)]">
      <article className="min-w-0">
        <p className="eyebrow mb-5 text-primary">{guide.group}</p>
        <h1 className="font-editorial text-[38px] leading-[1.12] sm:text-5xl">{guide.title}</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">{guide.description}</p>
        <nav aria-label="On this page" className="mt-8 border-y py-5 xl:hidden">
          <p className="eyebrow mb-3">On this page</p>
          <ul className="space-y-2">
            {guide.sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-block py-1 text-sm text-muted-foreground hover:text-primary"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="doc-copy mt-10 space-y-10">
          {guide.sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`heading-${section.id}`}
              className="scroll-mt-28"
            >
              <h2
                id={`heading-${section.id}`}
                className="mb-5 font-editorial text-[28px] leading-8"
              >
                {section.title}
              </h2>
              {section.body}
            </section>
          ))}
        </div>
        <nav aria-label="Guide pages" className="mt-12 grid gap-4 border-t pt-6 sm:grid-cols-2">
          {previous ? (
            <Link
              to="/docs/$slug"
              params={{ slug: previous.slug }}
              className="group rounded-sm border p-4 hover:bg-muted"
            >
              <span className="eyebrow flex items-center gap-2">
                <ArrowLeft className="size-3" />
                Previous
              </span>
              <span className="mt-2 block text-sm group-hover:text-primary">{previous.title}</span>
            </Link>
          ) : (
            <Link to="/docs" className="rounded-sm border p-4 text-sm hover:bg-muted">
              <span className="eyebrow block">Back to</span>
              <span className="mt-2 block">Overview</span>
            </Link>
          )}
          {next && (
            <Link
              to="/docs/$slug"
              params={{ slug: next.slug }}
              className="group rounded-sm border p-4 hover:bg-muted"
            >
              <span className="eyebrow flex items-center gap-2">
                Next
                <ArrowRight className="size-3" />
              </span>
              <span className="mt-2 block text-sm group-hover:text-primary">{next.title}</span>
            </Link>
          )}
        </nav>
      </article>
      <nav aria-label="On this page" className="sticky top-30 hidden border-l pl-5 xl:block">
        <p className="eyebrow mb-4">On this page</p>
        <ul className="space-y-3">
          {guide.sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="text-xs leading-5 text-muted-foreground hover:text-primary"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
