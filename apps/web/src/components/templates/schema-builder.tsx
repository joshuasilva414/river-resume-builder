import {
  type ContentSchemaField,
  newId,
  type SchemaBundle,
  type SchemaReference,
  sameSchema,
  schemaKey,
} from "@river/domain";
import { useState } from "react";
import { FormField, selectClass } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";

const scalarTypes = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes/no" },
  { value: "skill", label: "Skill" },
] as const;
const fieldTypes = [
  ...scalarTypes,
  { value: "list", label: "List of values" },
  { value: "record", label: "Nested entry" },
  { value: "records", label: "List of entries" },
] as const;
const newField: ContentSchemaField = {
  id: "new-field",
  label: "",
  required: false,
  kind: "text",
};

/** Edits definitions only. Saved content values are never converted or removed here. */
function FieldDefinition({
  field,
  schema,
  bundle,
  disabled,
  onChange,
}: {
  field: ContentSchemaField;
  schema: SchemaReference;
  bundle: SchemaBundle;
  disabled: boolean;
  onChange: (field: ContentSchemaField) => void;
}) {
  const nested = field.kind === "record" || field.kind === "records" ? field : null;
  const child = nested && bundle.schemas.find((item) => sameSchema(item, nested.schema));
  const layouts = nested
    ? bundle.layouts.filter((item) => sameSchema(item.schema, nested.schema))
    : [];
  const firstChild = bundle.schemas.find(
    (item) =>
      !sameSchema(item, schema) && bundle.layouts.some((layout) => sameSchema(layout.schema, item)),
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Field label">
          <Input
            value={field.label}
            disabled={disabled}
            onChange={(event) => onChange({ ...field, label: event.target.value })}
          />
        </FormField>
        <FormField label="Field type">
          <select
            className={selectClass}
            value={field.kind}
            disabled={disabled}
            onChange={(event) => {
              const kind = fieldTypes.find((item) => item.value === event.target.value)?.value;
              if (!kind || kind === field.kind) return;
              const common = { id: field.id, label: field.label, required: field.required };
              if (kind === "record" || kind === "records") {
                if (nested) onChange({ ...nested, kind });
                else {
                  const layout = bundle.layouts.find(
                    (item) => firstChild && sameSchema(item.schema, firstChild),
                  );
                  if (firstChild && layout)
                    onChange({
                      ...common,
                      kind,
                      schema: { id: firstChild.id, revision: firstChild.revision },
                      defaultLayout: { id: layout.id, revision: layout.revision },
                    });
                }
              } else if (kind === "list")
                onChange({
                  ...common,
                  kind,
                  items: scalarTypes.find((item) => item.value === field.kind)?.value ?? "text",
                });
              else onChange({ ...common, kind });
            }}
          >
            {fieldTypes.map((item) => (
              <option
                key={item.value}
                value={item.value}
                disabled={
                  (item.value === "record" || item.value === "records") && !nested && !firstChild
                }
              >
                {item.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      {field.kind === "list" && (
        <FormField label="List item type">
          <select
            className={selectClass}
            value={field.items}
            disabled={disabled}
            onChange={(event) => {
              const items = scalarTypes.find((item) => item.value === event.target.value)?.value;
              if (items) onChange({ ...field, items });
            }}
          >
            {scalarTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </FormField>
      )}
      {nested && (
        <div className="space-y-3 rounded-md bg-muted/30 p-3">
          <FormField label="Entry fields">
            <select
              className={selectClass}
              value={schemaKey(nested.schema)}
              disabled={disabled}
              onChange={(event) => {
                const next = bundle.schemas.find((item) => schemaKey(item) === event.target.value);
                if (!next) return;
                const layout = bundle.layouts.find((item) => sameSchema(item.schema, next));
                onChange({
                  ...nested,
                  schema: { id: next.id, revision: next.revision },
                  defaultLayout: layout
                    ? { id: layout.id, revision: layout.revision }
                    : nested.defaultLayout,
                });
              }}
            >
              {!child && <option value={schemaKey(nested.schema)}>Missing entry definition</option>}
              {bundle.schemas.map((item) => (
                <option key={schemaKey(item)} value={schemaKey(item)}>
                  {item.name} · {item.level}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Default layout">
            <select
              className={selectClass}
              value={schemaKey(nested.defaultLayout)}
              disabled={disabled || !layouts.length}
              onChange={(event) => {
                const layout = layouts.find((item) => schemaKey(item) === event.target.value);
                if (layout)
                  onChange({
                    ...nested,
                    defaultLayout: { id: layout.id, revision: layout.revision },
                  });
              }}
            >
              {!layouts.some((item) => sameSchema(item, nested.defaultLayout)) && (
                <option value={schemaKey(nested.defaultLayout)}>Choose a compatible layout</option>
              )}
              {layouts.map((item) => (
                <option key={schemaKey(item)} value={schemaKey(item)}>
                  {item.name}
                </option>
              ))}
            </select>
          </FormField>
          <p className="text-sm text-muted-foreground">
            {!child
              ? "This entry definition is missing. Choose entry fields before saving."
              : !layouts.length
                ? "These entry fields need a compatible layout. Add one in their layout controls."
                : `Every entry uses ${child.name}. Compatible layouts keep the same fields and values.`}
          </p>
        </div>
      )}
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={field.required}
          disabled={disabled}
          onChange={(event) => onChange({ ...field, required: event.target.checked })}
        />
        Required
      </label>
    </div>
  );
}

export function SchemaBuilder({
  bundle,
  onChange,
  disabled,
}: {
  bundle: SchemaBundle;
  onChange: (bundle: SchemaBundle) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState(bundle.schemas[0] ? schemaKey(bundle.schemas[0]) : "");
  const [draft, setDraft] = useState<ContentSchemaField>(newField);
  const [layoutName, setLayoutName] = useState("");
  const [startingLayout, setStartingLayout] = useState("");
  const schema = bundle.schemas.find((item) => schemaKey(item) === selected) ?? bundle.schemas[0];
  if (!schema) return null;
  const layouts = bundle.layouts.filter((item) => sameSchema(item.schema, schema));
  const copyLayout = layouts.find((item) => schemaKey(item) === startingLayout) ?? layouts[0];
  const validDraftReference =
    draft.kind !== "record" && draft.kind !== "records"
      ? true
      : bundle.schemas.some((item) => sameSchema(item, draft.schema)) &&
        bundle.layouts.some(
          (item) => sameSchema(item, draft.defaultLayout) && sameSchema(item.schema, draft.schema),
        );
  const selectSchema = (key: string) => {
    setSelected(key);
    setDraft(newField);
    setLayoutName("");
    setStartingLayout("");
  };
  const changeFields = (fields: readonly ContentSchemaField[]) =>
    onChange({
      ...bundle,
      schemas: bundle.schemas.map((item) =>
        sameSchema(item, schema) ? { ...item, fields } : item,
      ),
    });
  return (
    <details className="space-y-5 rounded-md border p-5">
      <summary className="cursor-pointer text-sm font-semibold">Fields and entry layouts</summary>
      <p className="text-sm text-muted-foreground">
        Compose the fields you need. Reference reusable entries and keep compatible layouts
        interchangeable. Changes here keep saved content values; use Undo to recover a definition.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Fields to edit">
          <select
            className={selectClass}
            value={schemaKey(schema)}
            disabled={disabled}
            onChange={(event) => selectSchema(event.target.value)}
          >
            {bundle.schemas.map((item) => (
              <option key={schemaKey(item)} value={schemaKey(item)}>
                {item.name} · {item.level}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Definition name">
          <Input
            value={schema.name}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...bundle,
                schemas: bundle.schemas.map((item) =>
                  sameSchema(item, schema) ? { ...item, name: event.target.value } : item,
                ),
              })
            }
          />
        </FormField>
      </div>
      <h3 className="font-semibold">{schema.name} fields</h3>
      <ol className="space-y-3">
        {schema.fields.map((field) => (
          <li key={field.id} className="space-y-2 rounded-md border p-4">
            <FieldDefinition
              field={field}
              schema={schema}
              bundle={bundle}
              disabled={disabled}
              onChange={(next) =>
                changeFields(schema.fields.map((item) => (item.id === field.id ? next : item)))
              }
            />
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || schema.fields.length === 1}
              onClick={() =>
                onChange({
                  ...bundle,
                  schemas: bundle.schemas.map((item) =>
                    sameSchema(item, schema)
                      ? { ...item, fields: item.fields.filter((item) => item.id !== field.id) }
                      : item,
                  ),
                  layouts: bundle.layouts.map((layout) =>
                    sameSchema(layout.schema, schema)
                      ? { ...layout, source: layout.source.replaceAll(`{{${field.id}}}`, "") }
                      : layout,
                  ),
                })
              }
            >
              Remove field
            </Button>
          </li>
        ))}
      </ol>
      <details className="space-y-3 rounded-md border p-4">
        <summary className="cursor-pointer text-sm font-semibold">Add field</summary>
        <FieldDefinition
          field={draft}
          schema={schema}
          bundle={bundle}
          disabled={disabled}
          onChange={setDraft}
        />
        <Button
          type="button"
          variant="outline"
          disabled={
            disabled || !draft.label.trim() || !validDraftReference || schema.fields.length >= 50
          }
          onClick={() => {
            const field = { ...draft, id: `field-${newId()}`, label: draft.label.trim() };
            onChange({
              ...bundle,
              schemas: bundle.schemas.map((item) =>
                sameSchema(item, schema) ? { ...item, fields: [...item.fields, field] } : item,
              ),
              layouts: bundle.layouts.map((layout) =>
                sameSchema(layout.schema, schema)
                  ? { ...layout, source: `${layout.source}\n{{${field.id}}}\\par` }
                  : layout,
              ),
            });
            setDraft(newField);
          }}
        >
          Add field
        </Button>
        <p className="text-sm text-muted-foreground">
          New fields are added to each compatible layout. Create another entry definition to use
          nested entries.
        </p>
      </details>
      <section className="space-y-4 border-t pt-5">
        <div>
          <h3 className="font-semibold">Compatible layouts</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Named layouts share {schema.name} fields. Entries can switch between these layouts
            without changing their values.
          </p>
        </div>
        {layouts.map((layout) => (
          <div key={schemaKey(layout)} className="space-y-3 rounded-md border p-4">
            <FormField label="Layout name">
              <Input
                value={layout.name}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...bundle,
                    layouts: bundle.layouts.map((item) =>
                      sameSchema(item, layout) ? { ...item, name: event.target.value } : item,
                    ),
                  })
                }
              />
            </FormField>
            <details className="space-y-3">
              <summary className="cursor-pointer text-sm font-medium">
                Advanced layout source
              </summary>
              <p className="text-sm text-muted-foreground">
                Use each field placeholder exactly once. The sample preview checks this LaTeX before
                Save.
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {schema.fields.map((field) => (
                  <li key={field.id} className="break-all">
                    {field.label}: <code>{`{{${field.id}}}`}</code>
                  </li>
                ))}
              </ul>
              <FormField label="LaTeX source">
                <Textarea
                  className="font-mono text-xs"
                  value={layout.source}
                  rows={8}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...bundle,
                      layouts: bundle.layouts.map((item) =>
                        sameSchema(item, layout) ? { ...item, source: event.target.value } : item,
                      ),
                    })
                  }
                />
              </FormField>
            </details>
          </div>
        ))}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="New layout name">
            <Input
              value={layoutName}
              disabled={disabled}
              placeholder="Compact experience"
              onChange={(event) => setLayoutName(event.target.value)}
            />
          </FormField>
          <FormField label="Starting layout">
            <select
              className={selectClass}
              value={copyLayout ? schemaKey(copyLayout) : ""}
              disabled={disabled || !layouts.length}
              onChange={(event) => setStartingLayout(event.target.value)}
            >
              {!layouts.length && <option value="">Simple field layout</option>}
              {layouts.map((item) => (
                <option key={schemaKey(item)} value={schemaKey(item)}>
                  {item.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !layoutName.trim() || bundle.layouts.length >= 100}
          onClick={() => {
            onChange({
              ...bundle,
              layouts: [
                ...bundle.layouts,
                {
                  id: `layout-${newId()}`,
                  revision: 1,
                  name: layoutName.trim(),
                  schema: { id: schema.id, revision: schema.revision },
                  source:
                    copyLayout?.source ??
                    schema.fields.map((field) => `{{${field.id}}}\\par`).join("\n"),
                },
              ],
            });
            setLayoutName("");
          }}
        >
          Add compatible layout
        </Button>
      </section>
      <div className="flex flex-wrap gap-3 border-t pt-5">
        {(["entry", "section"] as const).map((level) => (
          <Button
            type="button"
            variant="outline"
            key={level}
            disabled={disabled || bundle.schemas.length >= 50 || bundle.layouts.length >= 100}
            onClick={() => {
              const id = `schema-${newId()}`,
                layoutId = `layout-${newId()}`;
              onChange({
                ...bundle,
                schemas: [
                  ...bundle.schemas,
                  {
                    id,
                    revision: 1,
                    name: `Custom ${level}`,
                    level,
                    fields: [
                      {
                        id: level === "section" ? "heading" : "title",
                        label: level === "section" ? "Heading" : "Title",
                        kind: "text",
                        required: true,
                      },
                    ],
                  },
                ],
                layouts: [
                  ...bundle.layouts,
                  {
                    id: layoutId,
                    revision: 1,
                    name: "Default",
                    schema: { id, revision: 1 },
                    source:
                      level === "section"
                        ? "\\section*{ {{heading}} }"
                        : "\\textbf{ {{title}} }\\par",
                  },
                ],
              });
              selectSchema(`${id}@1`);
            }}
          >
            Create custom {level} fields
          </Button>
        ))}
      </div>
    </details>
  );
}
