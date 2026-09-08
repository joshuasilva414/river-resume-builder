import {
  builtInSchemaBundle,
  type ContentSchema,
  type SchemaBundle,
  schemaKey,
} from "@river/domain";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Failure, FormField, selectClass, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { getTemplate, getTemplates } from "~/server/template-functions";

/** Saved templates provide complete, immutable field and layout definitions. */
export function SavedSchemaPicker({
  level,
  disabled,
  onPick,
}: {
  level: ContentSchema["level"];
  disabled: boolean;
  onPick: (bundle: SchemaBundle, schema: ContentSchema) => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const templates = useInfiniteQuery({
    queryKey: ["templates", "schema-options"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await getTemplates({ data: { state: "Approved", offset: pageParam } })),
    getNextPageParam: (page, _pages, previous) => (page.hasMore ? previous + 50 : undefined),
  });
  const template = useQuery({
    queryKey: ["templates", "detail", templateId],
    enabled: Boolean(templateId),
    queryFn: async () => unwrap(await getTemplate({ data: { revisionId: templateId } })),
  });
  const bundle = templateId ? template.data?.revision.graph.composition : builtInSchemaBundle;
  return (
    <details className="space-y-4 rounded-md border p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Choose fields from a template
      </summary>
      <p className="text-sm text-muted-foreground">
        Changing the schema keeps your saved values. Fields with the same identity keep their values
        in the new form.
      </p>
      <FormField label="Template">
        <select
          className={selectClass}
          disabled={disabled}
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
        >
          <option value="">Default fields</option>
          {templates.data?.pages
            .flatMap((page) => page.items)
            .map((item) => (
              <option key={item.revisionId} value={item.revisionId}>
                {item.name}
              </option>
            ))}
        </select>
      </FormField>
      {templates.hasNextPage && (
        <Button type="button" variant="ghost" onClick={() => void templates.fetchNextPage()}>
          More templates
        </Button>
      )}
      <Failure error={templates.error ?? template.error} />
      <div className="flex flex-wrap gap-2">
        {bundle?.schemas
          .filter((schema) => schema.level === level)
          .map((schema) => (
            <Button
              type="button"
              key={schemaKey(schema)}
              variant="outline"
              disabled={disabled}
              onClick={() => onPick(bundle, schema)}
            >
              {schema.name}
            </Button>
          ))}
      </div>
      {template.data && !bundle && (
        <p className="text-sm text-muted-foreground">
          This older template uses the default fields. Edit it in Templates to add custom schemas.
        </p>
      )}
    </details>
  );
}
