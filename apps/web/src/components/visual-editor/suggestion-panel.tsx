import {
  applySuggestion,
  type ContentNode,
  findContent,
  newIdentity,
  type SuggestionResult,
  suggestionInputKey,
} from "@river/domain/workspace";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useRecords } from "~/components/workspace/queries";
import { ValueText } from "~/components/workspace/value-input";
import { requestWorkspaceSuggestions } from "~/server/workspace-analysis-functions";
import type { EditorController } from "./use-editor-controller";

function BlockValues({ node }: { node: ContentNode }) {
  return node.kind === "field" ? (
    <div className="space-y-1">
      <span className="text-[10px] uppercase text-muted-foreground">{node.label}</span>
      <p className="text-xs leading-5">
        <ValueText value={node.value} />
      </p>
    </div>
  ) : (
    <div className="space-y-3">
      {node.children.map((child) => (
        <BlockValues key={child.id} node={child} />
      ))}
    </div>
  );
}
export function SuggestionPanel({
  id,
  controller: c,
}: {
  id: string;
  controller: EditorController;
}) {
  const facts = useRecords("fact");
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [result, setResult] = useState<SuggestionResult | null>(null),
    [preview, setPreview] = useState<number | null>(null);
  const target = c.suggestionTarget
    ? findContent(c.resume.sections, c.suggestionTarget)
    : undefined;
  const stale =
    !!result &&
    (result.targetId !== target?.id ||
      result.inputKey !== suggestionInputKey(target, c.resume.job));
  const request = async (wording: boolean) => {
    if (!target) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const response = await requestWorkspaceSuggestions({
        data: {
          documentId: id,
          idempotencyKey: newIdentity(),
          targetId: target.id,
          resume: c.resume,
          factIds: selected,
          wording,
        },
      });
      if (!response.ok) throw Error(response.error.title);
      setResult(response.value);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to request suggestions.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="visual-inspector space-y-4" aria-label="Contextual suggestions">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase text-primary">Content suggestions</p>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close suggestions"
          onClick={() => c.setSuggestionTarget(null)}
        >
          <X />
        </Button>
      </div>
      <h2 className="font-serif text-2xl font-normal">
        {target?.label ?? "Select a content block"}
      </h2>
      <p className="text-xs leading-5 text-muted-foreground">
        {c.resume.job ? `For ${c.resume.job.title}.` : "Select a job to tailor the wording."}{" "}
        Requests run only when you click below.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-xs">
          Include candidate facts · {selected.length}
        </summary>
        <div className="mt-3 max-h-56 space-y-2 overflow-auto">
          {facts.data
            ?.filter((row) => row.kind === "fact")
            .map((row) => (
              <label key={row.id} className="flex gap-2 rounded border p-2 text-xs">
                <input
                  type="checkbox"
                  checked={selected.includes(row.id)}
                  disabled={!selected.includes(row.id) && selected.length >= 100}
                  onChange={() =>
                    setSelected(
                      selected.includes(row.id)
                        ? selected.filter((id) => id !== row.id)
                        : [...selected, row.id],
                    )
                  }
                />
                <span>
                  {row.data.label}
                  <span className="mt-1 block text-muted-foreground">
                    <ValueText value={row.data.value} />
                  </span>
                </span>
              </label>
            ))}
          {!facts.data?.length && (
            <p className="text-xs text-muted-foreground">
              No facts saved yet. Existing résumé values can still guide wording.
            </p>
          )}
        </div>
      </details>
      <Button
        className="w-full"
        size="sm"
        disabled={busy || !target}
        onClick={() => void request(true)}
      >
        <Sparkles />
        {busy ? "Requesting…" : "Suggest wording"}
      </Button>
      <Button
        className="w-full"
        size="sm"
        variant="outline"
        disabled={busy || !target}
        onClick={() => void request(false)}
      >
        Find library alternatives
      </Button>
      {stale && (
        <p
          role="alert"
          className="rounded bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100"
        >
          The target or job changed. These previews cannot be applied. Request fresh suggestions.
        </p>
      )}
      {result && !result.alternatives.length && (
        <p className="rounded border p-3 text-xs leading-5 text-muted-foreground">
          No applicable alternatives were found for this block. You can edit directly or save more
          reusable content.
        </p>
      )}
      {result?.alternatives.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Alternatives are immutable positions within one retained run.
        <article className="space-y-3 rounded border p-3" key={`${result.runId}:${index}`}>
          <button
            type="button"
            className="w-full space-y-1 text-left"
            onClick={() => setPreview(preview === index ? null : index)}
          >
            <p className="text-sm font-medium">{item.title}</p>
            <p className="text-xs leading-5 text-muted-foreground">{item.explanation}</p>
            <span className="text-xs text-primary">
              {preview === index ? "Hide preview" : "Preview change"}
            </span>
          </button>
          {preview === index && (
            <>
              <div className="space-y-3 border-t pt-3">
                <p className="text-xs font-medium">Before</p>
                {target && <BlockValues node={target} />}
                <p className="border-t pt-3 text-xs font-medium">After</p>
                <BlockValues node={item.replacement} />
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={stale}
                onClick={() => {
                  try {
                    c.updateResume((resume) => applySuggestion(resume, result, index));
                    setPreview(null);
                  } catch (error) {
                    setError(error instanceof Error ? error.message : "This suggestion is stale.");
                  }
                }}
              >
                Apply to this block
              </Button>
            </>
          )}
        </article>
      ))}
    </aside>
  );
}
