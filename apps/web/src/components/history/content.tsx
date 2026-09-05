import { compareHistoryEntries, historyJson, historyWording } from "@river/domain";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import type { HistorySnapshot } from "./selection";

function groups(snapshot: HistorySnapshot) {
  const { content } = snapshot;
  return [
    {
      name: "Wording",
      entries: historyWording(content.data, content.graph, content.source?.fields),
    },
    {
      name: "Composition and local overrides",
      entries: [
        historyJson(
          "composition",
          "Complete section/block/content order, identities, local overrides and base references",
          content.data,
        ),
      ],
    },
    {
      name: "Pinned library revisions",
      entries: content.graph.map((node) =>
        historyJson(node.revision.id, `${node.revision.data.kind} · ${node.revision.id}`, node),
      ),
    },
    {
      name: "Saved evidence, citations and context",
      entries: content.evidence.map((item) =>
        historyJson(
          `${item.claimId}/${item.revisionId}`,
          `Evidence revision ${item.revisionId}`,
          item,
        ),
      ),
    },
    {
      name: "Posting snapshot",
      entries: [
        historyJson("posting", "Complete original posting and association", content.posting),
      ],
    },
    {
      name: "Template and styles",
      entries: [
        historyJson("template", "Exact template graph and render identity", {
          identity: content.templateIdentity,
          graph: content.templateGraph,
        }),
      ],
    },
    {
      name: "Accepted source",
      entries: content.source
        ? [
            historyJson(
              "source-metadata",
              "Accepted source identity and complete intended fields",
              { ...content.source, source: undefined },
            ),
            { key: "source", label: "Complete accepted LaTeX", value: content.source.source },
          ]
        : [],
    },
  ];
}
export function HistoryContent({
  before,
  after,
}: {
  before: HistorySnapshot;
  after: HistorySnapshot;
}) {
  const [unchanged, setUnchanged] = useState(false),
    [expanded, setExpanded] = useState(false);
  const compared = useMemo(() => {
    const left = groups(before),
      right = groups(after);
    return left.map((group, index) => ({
      name: group.name,
      rows: compareHistoryEntries(group.entries, right[index]?.entries ?? []),
    }));
  }, [before, after]);
  return (
    <div className="space-y-5">
      <p className="text-sm">
        Wording uses exact placement identities. A copied placement appears as removed and added
        even when its text matches. Composition includes the complete original order and references.
      </p>
      {(before.content.source || after.content.source) && (
        <p className="border-l-2 border-warning bg-warning/10 p-4 text-sm">
          Wording reflects accepted source fields where present. The structured composition remains
          its retained base; accepted source changes are listed separately.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" aria-pressed={unchanged} onClick={() => setUnchanged(!unchanged)}>
          {unchanged ? "Hide" : "Show"} unchanged content
        </Button>
        <Button variant="outline" aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Collapse" : "Expand"} all values
        </Button>
      </div>
      {compared.map((group) => (
        <section key={group.name} className="space-y-3 border-t pt-5">
          <h3 className="font-editorial text-2xl">{group.name}</h3>
          <p className="text-xs text-muted-foreground">
            {group.rows.filter((row) => row.change !== "Unchanged" || row.moved).length} changed
            entries · {group.rows.length} total
          </p>
          {group.rows
            .filter((row) => unchanged || row.change !== "Unchanged" || row.moved)
            .map((row) => (
              <details
                key={`${row.key}:${expanded}`}
                open={expanded}
                className="min-w-0 rounded-md border p-4"
              >
                <summary className="cursor-pointer text-sm font-semibold break-words">
                  {row.change}
                  {row.moved ? " · Position changed" : ""} · {row.after?.label ?? row.before?.label}
                </summary>
                <p className="my-3 font-mono text-xs break-all">{row.key}</p>
                <div className="grid min-w-0 gap-5 md:grid-cols-2">
                  {(
                    [
                      ["Base", row.before],
                      ["Compare", row.after],
                    ] as const
                  ).map(([label, value]) => (
                    <section key={label} className="min-w-0 space-y-2">
                      <h4 className="font-semibold text-sm">
                        {label}
                        {value ? ` · Position ${value.index + 1}` : ""}
                      </h4>
                      <p className="text-xs text-muted-foreground">{value?.label}</p>
                      {value ? (
                        <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-sm bg-muted/40 p-3 font-mono text-xs leading-5">
                          {value.value === "" ? '"" (empty text)' : value.value}
                        </pre>
                      ) : (
                        <p className="text-sm">Absent</p>
                      )}
                    </section>
                  ))}
                </div>
              </details>
            ))}
        </section>
      ))}
    </div>
  );
}
