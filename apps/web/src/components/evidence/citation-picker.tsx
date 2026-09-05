import type { CitationInput } from "@river/domain";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { getSource, getSources } from "~/server/functions";
import { Failure, FormField, selectClass, unwrap } from "./shared";

export function CitationPicker({
  onAdd,
  onBack,
}: {
  onAdd: (citation: CitationInput) => void;
  onBack: () => void;
}) {
  const [sourceId, setSource] = useState("");
  const [processingId, setProcessing] = useState<string | undefined>();
  const [quote, setQuote] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () => unwrap(await getSources()),
  });
  const extraction = useQuery({
    queryKey: ["source", sourceId, processingId],
    enabled: Boolean(sourceId),
    queryFn: async () => unwrap(await getSource({ data: { id: sourceId, processingId } })),
  });
  const text = extraction.data?.extraction?.text ?? "";
  const matches: number[] = [];
  if (quote)
    for (
      let position = text.indexOf(quote);
      position !== -1 && matches.length < 100;
      position = text.indexOf(quote, position + 1)
    )
      matches.push(position);
  const start =
    matches.length === 1
      ? matches[0]
      : chosen !== null && matches.includes(chosen)
        ? chosen
        : undefined;
  const location = (offset: number) =>
    extraction.data?.extraction?.segments
      .filter((s) => s.end > offset && s.start < offset + quote.length)
      .map((s) => (s.page ? `Page ${s.page}` : s.line ? `Line ${s.line}` : `Offset ${s.start}`))
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(", ") || `Offset ${offset}`;
  return (
    <div className="space-y-5">
      <Failure error={sources.error ?? extraction.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Source">
          <select
            className={selectClass}
            value={sourceId}
            onChange={(event) => {
              setSource(event.target.value);
              setProcessing(undefined);
              setChosen(null);
              setQuote("");
            }}
          >
            <option value="">Choose a processed source</option>
            {sources.data
              ?.filter((s) => s.currentProcessingId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {s.kind === "attestation" ? " · Owner attestation" : ""}
                </option>
              ))}
          </select>
        </FormField>
        <FormField label="Extraction">
          <select
            className={selectClass}
            disabled={!extraction.data}
            value={processingId ?? extraction.data?.processingId ?? ""}
            onChange={(event) => {
              setProcessing(event.target.value);
              setQuote("");
              setChosen(null);
            }}
          >
            {extraction.data?.history.map((p, i) => (
              <option key={p.id} value={p.id}>
                {extraction.data.history.length - i} · {p.parser} ·{" "}
                {new Date(p.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      {sourceId && (
        <>
          <FormField label="Preserved extraction text">
            <Textarea
              readOnly
              value={text}
              className="h-48 font-sans leading-6"
              onSelect={(event) => {
                const input = event.currentTarget;
                if (input.selectionStart !== input.selectionEnd) {
                  setQuote(text.slice(input.selectionStart, input.selectionEnd));
                  setChosen(input.selectionStart);
                }
              }}
            />
          </FormField>
          <FormField label="Exact quote">
            <Textarea
              value={quote}
              maxLength={10000}
              onChange={(event) => {
                setQuote(event.target.value);
                setChosen(null);
              }}
              placeholder="Select text above or paste an exact passage."
            />
          </FormField>
        </>
      )}
      {quote && matches.length === 0 && (
        <p role="alert" className="text-destructive">
          This text is not in this extraction. Select a passage from the source.
        </p>
      )}
      {matches.length > 1 && (
        <fieldset className="space-y-3">
          <legend className="mb-2 font-medium">Choose the occurrence</legend>
          {matches.map((offset) => (
            <label key={offset} className="flex gap-3 rounded-sm border p-3">
              <input
                type="radio"
                name="citation-occurrence"
                checked={start === offset}
                onChange={() => setChosen(offset)}
              />
              <span>
                <span className="block text-xs text-muted-foreground">
                  {location(offset)} · {offset}–{offset + quote.length}
                </span>
                <span className="mt-2 block whitespace-pre-wrap">
                  {text.slice(Math.max(0, offset - 60), offset)}
                  <mark className="bg-highlight text-black">{quote}</mark>
                  {text.slice(offset + quote.length, offset + quote.length + 60)}
                </span>
              </span>
            </label>
          ))}
          {matches.length === 100 && (
            <p>Showing the first 100 matches. Select a longer passage to narrow the result.</p>
          )}
        </fieldset>
      )}
      {start !== undefined && (
        <p role="status" className="text-approved">
          Exact match · {location(start)} · offsets {start}–{start + quote.length}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
        <Button variant="outline" onClick={onBack}>
          Back to claim
        </Button>
        <Button
          disabled={
            start === undefined ||
            !extraction.data?.processingId ||
            extraction.isFetching ||
            quote.length > 10000
          }
          onClick={() => {
            if (start !== undefined && extraction.data?.processingId)
              onAdd({
                sourceId,
                processingId: extraction.data.processingId,
                quote,
                start,
                end: start + quote.length,
              });
          }}
        >
          Add citation
        </Button>
      </div>
    </div>
  );
}
