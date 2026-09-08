import { type Composition, type LibraryGraphNode, renderComposition } from "@river/domain";
import type { TemplateGraph } from "@river/templates";
import { lazy, Suspense } from "react";

const HtmlPreview = lazy(() =>
  import("./html-preview").then((module) => ({ default: module.HtmlPreview })),
);

export function DraftPreview({
  data,
  graph,
  templateGraph,
}: {
  data: Composition;
  graph: readonly LibraryGraphNode[];
  templateGraph?: TemplateGraph | null;
}) {
  let document: ReturnType<typeof renderComposition> | undefined;
  let failure: string | undefined;
  try {
    document = renderComposition(data, graph);
  } catch (error) {
    failure = error instanceof Error ? error.message : "Complete the content to see a preview.";
  }
  return (
    <aside className="min-w-0 bg-muted/60 xl:overflow-y-auto">
      <header className="space-y-1 border-b bg-background px-6 py-5">
        <h2 className="font-sans text-sm font-semibold">Approximate preview</h2>
        <p className="text-xs text-muted-foreground">
          Review the exported PDF for final spacing and page breaks. Custom templates may differ.
        </p>
      </header>
      <div className="p-6">
        {failure && (
          <p role="status" className="text-sm">
            {failure}
          </p>
        )}
        {document && (
          <Suspense fallback={<p className="text-sm">Loading preview…</p>}>
            <HtmlPreview document={document} theme={data.theme} templateGraph={templateGraph} />
          </Suspense>
        )}
      </div>
    </aside>
  );
}
