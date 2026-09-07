import { ValidationReport } from "@river/contracts";
import type { SourceField } from "@river/domain";
import type { CompleteTextDiff, SourceComparison } from "@river/templates/source-refinement";
import { useQuery } from "@tanstack/react-query";
import { Schema } from "effect";
import { useState } from "react";
import { Failure } from "~/components/evidence/shared";
import { EvidenceLinks } from "~/components/library/evidence-links";
import { PdfPreview } from "~/components/pdf-preview";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";

export function CompleteDiff({ diff, label }: { diff: CompleteTextDiff; label: string }) {
  const [mode, setMode] = useState("diff"),
    [context, setContext] = useState(false);
  const full = mode === "before" || mode === "after";
  const content = full
    ? diff.segments
        .filter((part) => part.kind !== (mode === "before" ? "Added" : "Removed"))
        .map((part) => part.text)
        .join("")
    : null;
  return (
    <section className="min-w-0 space-y-4" aria-label={label}>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["diff", "Every change"],
            ["before", "Complete before"],
            ["after", "Complete after"],
          ] as const
        ).map(([value, title]) => (
          <Button
            key={value}
            size="sm"
            variant={mode === value ? "default" : "outline"}
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {title}
          </Button>
        ))}
        {!full && (
          <Button
            size="sm"
            variant="outline"
            aria-pressed={context}
            onClick={() => setContext(!context)}
          >
            {context ? "Collapse" : "Expand"} unchanged context
          </Button>
        )}
      </div>
      {diff.mode === "complete-replacement" && (
        <p className="text-sm text-muted-foreground">
          This large comparison shows the complete removed and added files. No text is omitted.
        </p>
      )}
      <section
        className="max-h-[65vh] overflow-auto rounded-sm border bg-muted/40"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus and scroll the complete code region.
        tabIndex={0}
        aria-label={`${label}: ${mode}`}
      >
        {full ? (
          <pre className="min-w-full w-max p-4 font-mono text-xs leading-[22px]">{content}</pre>
        ) : (
          diff.segments.map((part) =>
            part.kind === "Unchanged" && !context ? (
              <details key={part.id} className="border-b px-4 py-2 text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Unchanged context · {part.beforeEnd - part.beforeStart} characters
                </summary>
                <pre className="mt-3 w-max font-mono text-xs leading-[22px]">{part.text}</pre>
              </details>
            ) : (
              <div
                key={part.id}
                className={cn(
                  "border-b",
                  part.kind === "Added" && "bg-approved/10",
                  part.kind === "Removed" && "bg-muted",
                )}
              >
                <p className="sticky left-0 w-fit px-4 pt-2 font-mono text-[11px] text-muted-foreground">
                  {part.kind} · before {part.beforeStart}–{part.beforeEnd} · after {part.afterStart}
                  –{part.afterEnd}
                </p>
                <pre className="w-max min-w-full px-4 pb-3 font-mono text-xs leading-[22px]">
                  {part.text}
                </pre>
              </div>
            ),
          )
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        Offsets use UTF-16 characters, start inclusive and end exclusive. Complete before/after
        views preserve all whitespace.
      </p>
    </section>
  );
}

function FieldValue({
  field,
  position,
  label,
}: {
  field: SourceField | null;
  position: number | null;
  label: string;
}) {
  const [support, setSupport] = useState(false);
  return (
    <div className="min-w-0 space-y-3">
      <p className="font-semibold">
        {label}
        {position === null ? "" : ` · Position ${position + 1}`}
      </p>
      {field ? (
        <>
          <p className="whitespace-pre-wrap break-words">{field.text}</p>
          <p className="text-xs text-muted-foreground">
            {field.origin === "source"
              ? "Source origin · no structured placement"
              : "Structured origin"}{" "}
            · {field.role} · {field.required ? "Required" : "Optional"}
          </p>
          {field.reviewRequired && (
            <Badge variant="outline">Fresh clarification review required</Badge>
          )}
          {field.role === "content" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSupport(!support)}
                aria-expanded={support}
              >
                {support ? "Close" : "Inspect"} exact support · {field.evidence.length}
              </Button>
              {support && <EvidenceLinks value={field.evidence} />}
            </>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">No field</p>
      )}
    </div>
  );
}
export function FieldComparison({ fields }: { fields: SourceComparison["fields"] }) {
  const [changedOnly, setChangedOnly] = useState(false),
    [offset, setOffset] = useState(0);
  const changed = fields.filter(
      (field) => field.textChanged || field.supportChanged || field.moved,
    ),
    rows = changedOnly ? changed : fields;
  return (
    <section className="space-y-5" aria-label="Résumé fields and support">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={changedOnly ? "outline" : "default"}
          aria-pressed={!changedOnly}
          onClick={() => {
            setChangedOnly(false);
            setOffset(0);
          }}
        >
          All fields · {fields.length}
        </Button>
        <Button
          variant={changedOnly ? "default" : "outline"}
          aria-pressed={changedOnly}
          onClick={() => {
            setChangedOnly(true);
            setOffset(0);
          }}
        >
          Changed / moved · {changed.length}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        The complete intended manifest includes wording, order, origin and support. Model
        classifications help review; they do not establish factual support.
      </p>
      <div className="divide-y">
        {rows.slice(offset, offset + 20).map((field) => (
          <article key={field.id} className="space-y-4 py-5 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {!field.before
                  ? "Added"
                  : !field.after
                    ? "Removed"
                    : field.textChanged
                      ? "Text changed"
                      : "Text unchanged"}
              </Badge>
              {field.moved && <Badge variant="outline">Moved</Badge>}
              {field.supportChanged && <Badge variant="outline">Support changed</Badge>}
              {(field.textChanged || field.supportChanged) && (
                <Badge variant="outline">{field.classification}</Badge>
              )}
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <FieldValue field={field.before} position={field.beforeIndex} label="Before" />
              <FieldValue field={field.after} position={field.afterIndex} label="After" />
            </div>
            {field.meaning && (
              <p className="whitespace-pre-wrap text-muted-foreground">
                Model assessment: {field.meaning.assessment}. {field.meaning.explanation}
              </p>
            )}
          </article>
        ))}
      </div>
      {!rows.length && <p>No fields match this view.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={!offset}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          Previous fields
        </Button>
        <p className="text-sm">
          {rows.length
            ? `${offset + 1}–${Math.min(offset + 20, rows.length)} of ${rows.length}`
            : "0 fields"}
        </p>
        <Button
          variant="outline"
          disabled={offset + 20 >= rows.length}
          onClick={() => setOffset(offset + 20)}
        >
          Next fields
        </Button>
      </div>
    </section>
  );
}

function Report({ operationId }: { operationId: string }) {
  const query = useQuery({
    queryKey: ["source-artifact-report", operationId],
    queryFn: async () => {
      const response = await fetch(`/api/artifacts/${operationId}/report`);
      if (!response.ok)
        throw new Error(
          "This exact report is unavailable. Refresh the saved review and inspect its preview or publication state.",
        );
      return Schema.decodeUnknownSync(ValidationReport)(await response.json());
    },
  });
  return (
    <section className="space-y-4">
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading exact validation report…</p>}
      {query.error && (
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry report
        </Button>
      )}
      {query.data && (
        <>
          <Badge variant="outline">
            {query.data.passed ? "Text integrity passed" : "Text integrity failed"}
          </Badge>
          {query.data.errors.map((error) => (
            <p key={error} className="text-sm text-destructive">
              {error}
            </p>
          ))}
          {query.data.firstDifference && (
            <p className="text-sm whitespace-pre-wrap">
              Check this expected wording: {query.data.firstDifference.expectedText}
            </p>
          )}
          {query.data.warnings.map((warning) => (
            <p key={warning} className="border-l-2 border-highlight bg-highlight/10 p-4">
              Layout advisory: {warning}
            </p>
          ))}
        </>
      )}
    </section>
  );
}

export function DocumentComparison({
  baseOperationId,
  candidateOperationId,
}: {
  baseOperationId: string;
  candidateOperationId: string | null;
}) {
  return (
    <Tabs defaultValue="base" className="min-w-0 gap-4">
      <TabsList className="grid w-full shrink-0 grid-cols-2 gap-2 p-0 group-data-[orientation=horizontal]/tabs:h-auto lg:grid-cols-4">
        <TabsTrigger className="h-11 min-w-0 whitespace-normal" value="base">
          Original PDF
        </TabsTrigger>
        <TabsTrigger className="h-11 min-w-0 whitespace-normal" value="candidate">
          Proposed PDF
        </TabsTrigger>
        <TabsTrigger className="h-11 min-w-0 whitespace-normal" value="base-report">
          Original report
        </TabsTrigger>
        <TabsTrigger className="h-11 min-w-0 whitespace-normal" value="candidate-report">
          Proposed report
        </TabsTrigger>
      </TabsList>
      <TabsContent value="base">
        <PdfPreview url={`/api/artifacts/${baseOperationId}/pdf`} />
      </TabsContent>
      <TabsContent value="candidate">
        {candidateOperationId ? (
          <PdfPreview url={`/api/artifacts/${candidateOperationId}/pdf`} />
        ) : (
          <p className="border-l-2 border-highlight p-4">
            No current candidate PDF is available. Inspect the saved operation and its recovery
            options.
          </p>
        )}
      </TabsContent>
      <TabsContent value="base-report">
        <Report operationId={baseOperationId} />
      </TabsContent>
      <TabsContent value="candidate-report">
        {candidateOperationId ? (
          <Report operationId={candidateOperationId} />
        ) : (
          <p>No current rendered report is available.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}

export function SourceComparisonViews({
  fields,
  baseOperationId,
  candidateOperationId,
}: {
  source: CompleteTextDiff;
  fields: SourceComparison["fields"];
  extracted: CompleteTextDiff | null;
  baseOperationId: string;
  candidateOperationId: string | null;
}) {
  return (
    <Tabs defaultValue="pdf" className="min-w-0 gap-5">
      <TabsList className="grid w-full grid-cols-2 gap-2 p-0 group-data-[orientation=horizontal]/tabs:h-auto">
        <TabsTrigger className="h-11" value="pdf">
          Preview & checks
        </TabsTrigger>
        <TabsTrigger className="h-11" value="wording">
          Wording & evidence
        </TabsTrigger>
      </TabsList>
      <TabsContent value="pdf">
        <DocumentComparison
          baseOperationId={baseOperationId}
          candidateOperationId={candidateOperationId}
        />
      </TabsContent>
      <TabsContent value="wording">
        <FieldComparison fields={fields} />
      </TabsContent>
    </Tabs>
  );
}
