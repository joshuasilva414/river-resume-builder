import {
  blockDefinitions,
  type CommandOutcome,
  canonicalJson,
  contentTypes,
  fingerprint,
  type Theme,
} from "@river/domain";
import {
  effectiveStyles,
  fixedPack,
  graphTemplates,
  scopedTemplate,
  type TemplateBase,
  type TemplateGraph,
  type TemplateRevision,
  type TemplateScope,
  validateGraph,
} from "@river/templates";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import {
  Failure,
  FormField,
  RequestFailure,
  selectClass,
  unwrap,
} from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { getTemplate, getTemplates } from "~/server/template-functions";

export type TemplateDetail = Extract<
  Awaited<ReturnType<typeof getTemplate>>,
  { ok: true }
>["value"];
export const themes: readonly Theme[] = ["classic", "minimal", "technical"];
export const scopes: readonly TemplateScope[] = [
  { level: "document", type: null },
  ...contentTypes
    .filter((type) => type !== "contact")
    .map((type) => ({ level: "section" as const, type })),
  ...contentTypes.map((type) => ({ level: "block" as const, type })),
];
export const scopeKey = (scope: TemplateScope) => `${scope.level}:${scope.type ?? "document"}`;
export const scopeLabel = (scope: TemplateScope) =>
  scope.level === "document"
    ? "Document"
    : `${blockDefinitions[scope.type].label} ${scope.level === "section" ? "Section" : "Block"}`;
export const baseKey = (base: TemplateBase) =>
  base.kind === "fixed" ? `fixed:${base.theme}` : `saved:${base.revisionId}`;
export function useTemplate(id: string | null) {
  return useQuery({
    queryKey: ["templates", "detail", id],
    enabled: Boolean(id),
    queryFn: async () => unwrap(await getTemplate({ data: { revisionId: id ?? "" } })),
    refetchInterval: (query) =>
      query.state.data?.validations.some((item) =>
        ["Pending", "Running"].includes(item.operation.state),
      )
        ? 2000
        : false,
  });
}
export function useTemplateBase(base: TemplateBase) {
  const saved = useTemplate(base.kind === "saved" ? base.revisionId : null);
  return {
    ...saved,
    graph:
      base.kind === "fixed" ? validateGraph(fixedPack(base.theme)) : saved.data?.revision.graph,
  };
}
export function useTemplateCommand<T>(
  run: (input: T, key: string) => Promise<CommandOutcome>,
  onSaved?: (result: CommandOutcome) => void,
) {
  const client = useQueryClient(),
    request = useRef<{ payload: string; key: string } | null>(null);
  return useMutation({
    mutationFn: async (input: T) => {
      const payload = canonicalJson(input);
      if (request.current?.payload !== payload)
        request.current = { payload, key: crypto.randomUUID() };
      return run(input, request.current.key);
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["templates"] });
      onSaved?.(result);
    },
    onError: (error) => {
      if (error instanceof RequestFailure && error.problem.code === "Conflict")
        void client.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}
export function BasePicker({
  value,
  onChange,
  approvedOnly = false,
  label = "Base complete graph",
  disabled = false,
}: {
  value: TemplateBase;
  onChange: (value: TemplateBase) => void;
  approvedOnly?: boolean;
  label?: string;
  disabled?: boolean;
}) {
  const list = useInfiniteQuery({
    queryKey: ["templates", "options", approvedOnly],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await getTemplates({
          data: { state: approvedOnly ? "Approved" : null, offset: pageParam },
        }),
      ),
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length * 50 : undefined),
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="space-y-2">
      <FormField label={label}>
        <select
          className={selectClass}
          value={baseKey(value)}
          disabled={disabled}
          onChange={(event) => {
            const fixed = themes.find((theme) => `fixed:${theme}` === event.target.value);
            if (fixed) onChange({ kind: "fixed", theme: fixed });
            else {
              const item = items.find((item) => `saved:${item.revisionId}` === event.target.value);
              if (item) onChange({ kind: "saved", revisionId: item.revisionId });
            }
          }}
        >
          {themes.map((theme) => (
            <option key={theme} value={`fixed:${theme}`}>
              {theme[0]?.toUpperCase()}
              {theme.slice(1)} · built-in revision 1
            </option>
          ))}
          {value.kind === "saved" &&
            !items.some((item) => item.revisionId === value.revisionId) && (
              <option value={baseKey(value)}>Captured revision · {value.revisionId}</option>
            )}
          {items.map((item) => (
            <option key={item.revisionId} value={`saved:${item.revisionId}`}>
              {item.name} · revision {item.version} · {item.state}
            </option>
          ))}
        </select>
      </FormField>
      <Failure error={list.error} />
      {list.hasNextPage && (
        <Button
          variant="link"
          size="sm"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Load more template revisions
        </Button>
      )}
    </div>
  );
}
export function ScopePicker({
  value,
  onChange,
  disabled,
}: {
  value: TemplateScope;
  onChange: (value: TemplateScope) => void;
  disabled?: boolean;
}) {
  return (
    <FormField label="Component scope">
      <select
        className={selectClass}
        value={scopeKey(value)}
        disabled={disabled}
        onChange={(event) => {
          const scope = scopes.find((scope) => scopeKey(scope) === event.target.value);
          if (scope) onChange(scope);
        }}
      >
        {scopes.map((scope) => (
          <option key={scopeKey(scope)} value={scopeKey(scope)}>
            {scopeLabel(scope)}
          </option>
        ))}
      </select>
    </FormField>
  );
}
export function CodePayload({ value, label }: { value: unknown; label: string }) {
  return (
    <div className="min-w-0 space-y-2">
      <h3 className="font-sans text-sm font-semibold">{label}</h3>
      <pre
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the complete code payload.
        tabIndex={0}
        className="max-h-[440px] overflow-auto rounded-sm border bg-muted/50 p-4 font-mono text-xs leading-5"
      >
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
export function ComponentPayload({
  template,
  label,
}: {
  template: TemplateRevision;
  label: string;
}) {
  const digest = useQuery({
    queryKey: ["templates", "component-digest", template],
    queryFn: () => fingerprint(canonicalJson(template)),
    staleTime: Infinity,
  });
  return (
    <section className="min-w-0 space-y-4">
      <p className="eyebrow break-all">
        {label} · {template.manifest.id} / {template.manifest.revision}
      </p>
      <p className="break-all font-mono text-xs text-muted-foreground">
        SHA-256 {digest.data ?? "Calculating…"}
      </p>
      <CodePayload value={template.manifest} label="Complete manifest" />
      <CodePayload value={template.source} label="Complete LaTeX fragment" />
    </section>
  );
}
export function inheritedStyles(graph: TemplateGraph, scope: TemplateScope) {
  const document = effectiveStyles(graph.tokens, graph.document.manifest);
  if (scope.level === "document") return graph.tokens;
  if (scope.level === "section" || scope.type === "contact") return document;
  return effectiveStyles(
    document,
    scopedTemplate(graph, { level: "section", type: scope.type }).manifest,
  );
}
export function GraphView({ graph, original }: { graph: TemplateGraph; original?: TemplateGraph }) {
  return (
    <section className="min-w-0 space-y-3">
      <h3 className="font-sans text-sm font-semibold">
        Complete resulting graph · {graphTemplates(graph).length} components
      </h3>
      {scopes.map((scope) => {
        const template = scopedTemplate(graph, scope),
          before = original ? scopedTemplate(original, scope) : undefined;
        return (
          <details key={scopeKey(scope)} className="min-w-0 border-b py-2">
            <summary className="cursor-pointer text-sm">
              <span className="font-semibold">{scopeLabel(scope)}</span>
              <span className="ml-3 text-muted-foreground">
                {" · "}
                {before
                  ? canonicalJson(before) === canonicalJson(template)
                    ? "Unchanged"
                    : "Replacement"
                  : `Manifest revision ${template.manifest.revision}`}
              </span>
            </summary>
            <div className="mt-4 space-y-4">
              <ComponentPayload template={template} label="Exact component" />
              <CodePayload
                label="Resolved styles"
                value={
                  original && before
                    ? {
                        before: effectiveStyles(inheritedStyles(original, scope), before.manifest),
                        after: effectiveStyles(inheritedStyles(graph, scope), template.manifest),
                      }
                    : effectiveStyles(inheritedStyles(graph, scope), template.manifest)
                }
              />
            </div>
          </details>
        );
      })}
    </section>
  );
}
