import {
  ContentRecord,
  type ContentSchemaField,
  canonicalJson,
  type EvidenceReference,
  formatPartialDate,
  newId,
  PartialDate,
  readLegacyDate,
  type SchemaBundle,
  type StructuredContent,
  sameSchema,
  schemaKey,
} from "@river/domain";
import { Schema } from "effect";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FormField, selectClass } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { EditorDisclosure } from "./editor-disclosure";
import { EvidenceFill, SkillOptions } from "./evidence-fill";
import { SavedEntryPicker } from "./saved-entry-picker";
import { schemaHistoryKey } from "./schema-transition";

type ScalarKind = "text" | "number" | "date" | "boolean" | "skill";
function DateControl({
  label,
  value,
  onChange,
  disabled,
  required,
}: {
  label: string;
  value: Schema.Json | undefined;
  onChange: (value: Schema.Json) => void;
  disabled: boolean;
  required: boolean;
}) {
  const decoded = Schema.decodeUnknownOption(PartialDate)(value);
  const date = decoded._tag === "Some" ? decoded.value : undefined;
  const [text, setText] = useState(() => (date ? formatPartialDate(date) : ""));
  const emitted = useRef(canonicalJson(value ?? null));
  useEffect(() => {
    const current = canonicalJson(value ?? null);
    if (current === emitted.current) return;
    emitted.current = current;
    setText(date ? formatPartialDate(date) : "");
  }, [value, date]);
  return (
    <FormField label={label}>
      <Input
        aria-label={label}
        required={required}
        disabled={disabled}
        value={text}
        placeholder="2025, May 2025, or Present"
        maxLength={200}
        onChange={(event) => {
          const input = event.target.value;
          const next = input.trim() ? readLegacyDate(input) : null;
          emitted.current = canonicalJson(next);
          setText(input);
          onChange(next);
        }}
      />
    </FormField>
  );
}
function ScalarControl({
  kind,
  label,
  required,
  value,
  onChange,
  disabled,
}: {
  kind: ScalarKind;
  label: string;
  required: boolean;
  value: Schema.Json | undefined;
  onChange: (value: Schema.Json) => void;
  disabled: boolean;
}) {
  if (kind === "date")
    return (
      <DateControl
        label={label}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
      />
    );
  if (kind === "boolean")
    return (
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          disabled={disabled}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
    );
  const text = typeof value === "string" || typeof value === "number" ? value : "";
  return (
    <FormField label={label}>
      {kind === "text" &&
      (label.toLowerCase().includes("summary") ||
        label.toLowerCase().includes("accomplishment")) ? (
        <Textarea
          required={required}
          disabled={disabled}
          value={text}
          rows={4}
          maxLength={10000}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          required={required}
          disabled={disabled}
          type={kind === "number" ? "number" : "text"}
          step={kind === "number" ? "any" : undefined}
          value={text}
          maxLength={10000}
          onChange={(event) =>
            onChange(
              kind === "number"
                ? event.target.value === ""
                  ? null
                  : Number(event.target.value)
                : event.target.value,
            )
          }
        />
      )}
    </FormField>
  );
}
function move<T>(values: readonly T[], index: number, delta: number): readonly T[] {
  const next = [...values],
    item = next[index];
  if (item === undefined) return values;
  next.splice(index, 1);
  next.splice(index + delta, 0, item);
  return next;
}

/** Shape checks keep schema changes recoverable without converting previously entered values. */
function fieldShapeProblem(field: ContentSchemaField, value: Schema.Json | undefined) {
  if (value === undefined || value === null) return null;
  const scalarMatches = (kind: ScalarKind, item: Schema.Json): boolean => {
    if (item === null || item === "") return true;
    if (kind === "date") return Schema.decodeUnknownOption(PartialDate)(item)._tag === "Some";
    if (kind === "number") return typeof item === "number" && Number.isFinite(item);
    if (kind === "boolean") return typeof item === "boolean";
    return typeof item === "string";
  };
  if (field.kind === "record" || field.kind === "records") {
    const decoded = Schema.decodeUnknownOption(Schema.Array(ContentRecord))(
      field.kind === "record" ? [value] : value,
    );
    if (decoded._tag === "None") return "This saved value uses a different entry shape.";
    if (decoded.value.some((record) => !sameSchema(record.schema, field.schema)))
      return "These saved entries use a different field definition.";
    return null;
  }
  if (field.kind === "list")
    return Array.isArray(value) &&
      value.every((item) =>
        field.items === "skill" ? typeof item === "string" : scalarMatches(field.items, item),
      )
      ? null
      : "This saved value uses a different list item type.";
  return scalarMatches(field.kind, value) ? null : "This saved value uses a different field type.";
}

function RowActions({
  label,
  index,
  count,
  disabled,
  onMove,
  onRemove,
}: {
  label: string;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Move ${label} up`}
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Move ${label} down`}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${label}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
function ScalarListField({
  field,
  values,
  disabled,
  onChange,
}: {
  field: Extract<ContentSchemaField, { kind: "list" }>;
  values: readonly Schema.Json[];
  disabled: boolean;
  onChange: (values: readonly Schema.Json[]) => void;
}) {
  const [rows, setRows] = useState(() => values.map((value) => ({ id: newId(), value })));
  const [initialRows] = useState(() => new Set(rows.map((row) => row.id)));
  const current = canonicalJson(values),
    previous = canonicalJson(rows.map((row) => row.value));
  if (current !== previous) {
    const available = [...rows];
    setRows(
      values.map((value) => {
        const index = available.findIndex(
          (row) => canonicalJson(row.value) === canonicalJson(value),
        );
        const existing = index < 0 ? undefined : available.splice(index, 1)[0];
        return existing ?? { id: newId(), value };
      }),
    );
  }
  const update = (next: typeof rows) => {
    setRows(next);
    onChange(next.map((row) => row.value));
  };
  return (
    <EditorDisclosure
      title={field.label}
      summary={`${rows.length} ${rows.length === 1 ? "item" : "items"}`}
      defaultOpen={!rows.length}
      revealKey={rows
        .filter((row) => !initialRows.has(row.id))
        .map((row) => row.id)
        .join("/")}
    >
      {rows.map((row, index) => (
        <div key={row.id} className="space-y-2 rounded-sm border p-3">
          <ScalarControl
            kind={field.items}
            label={`${field.label} ${index + 1}`}
            required={field.required && index === 0}
            value={row.value}
            disabled={disabled}
            onChange={(value) =>
              update(rows.map((item) => (item.id === row.id ? { ...item, value } : item)))
            }
          />
          <RowActions
            label={`${field.label} ${index + 1}`}
            index={index}
            count={rows.length}
            disabled={disabled}
            onMove={(delta) => update([...move(rows, index, delta)])}
            onRemove={() => update(rows.filter((item) => item.id !== row.id))}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={disabled || rows.length >= 200}
        onClick={() =>
          update([
            ...rows,
            {
              id: newId(),
              value: field.items === "number" ? 0 : field.items === "boolean" ? false : "",
            },
          ])
        }
      >
        <Plus />
        Add {field.label.toLowerCase()}
      </Button>
    </EditorDisclosure>
  );
}

export function recordTitle(record: ContentRecord, fallback = "Entry") {
  const values = [
    "employer",
    "title",
    "project",
    "institution",
    "degree",
    "credential",
    "url",
    "name",
    "heading",
  ].flatMap((key) =>
    typeof record.values[key] === "string" && record.values[key]
      ? [String(record.values[key])]
      : [],
  );
  return (
    values.slice(0, 2).join(" · ") ||
    `New ${fallback.toLowerCase().replace(/ies$/, "y").replace(/s$/, "")}`
  );
}

export function SchemaRecordFields({
  bundle,
  record,
  onChange,
  onEvidence,
  disabled = false,
}: {
  bundle: SchemaBundle;
  record: ContentRecord;
  onChange: (record: ContentRecord) => void;
  onEvidence?: (evidence: readonly EvidenceReference[]) => void;
  disabled?: boolean;
}) {
  const latestRecord = useRef(record);
  latestRecord.current = record;
  const [initialEntries] = useState(
    () =>
      new Set(
        Object.values(record.values).flatMap((value) =>
          (Array.isArray(value) ? value : [value]).flatMap((item) =>
            item && typeof item === "object" && !Array.isArray(item) && typeof item.id === "string"
              ? [item.id]
              : [],
          ),
        ),
      ),
  );
  const definition = bundle.schemas.find((item) => sameSchema(item, record.schema));
  if (!definition)
    return (
      <div className="space-y-3 rounded-md border p-4">
        <p role="alert" className="text-sm">
          This entry definition is missing. Your saved values are preserved. Choose their saved
          template or another field definition before saving.
        </p>
        <pre className="whitespace-pre-wrap break-words text-xs">
          {JSON.stringify(record.values, null, 2)}
        </pre>
      </div>
    );
  const change = (field: ContentSchemaField, value: Schema.Json) => {
    const next = {
      ...latestRecord.current,
      values: { ...latestRecord.current.values, [field.id]: value },
    };
    latestRecord.current = next;
    onChange(next);
  };
  const renderField = (field: ContentSchemaField) => {
    const value = record.values[field.id];
    const shapeProblem = fieldShapeProblem(field, value);
    if (shapeProblem && value !== undefined)
      return (
        <section key={field.id} className="space-y-3 rounded-md border p-4">
          <h3 className="text-sm font-semibold">{field.label}</h3>
          <p role="alert" className="text-sm">
            {shapeProblem} Keep this value and switch back to its fields, or start a new value for
            this definition.
          </p>
          <details>
            <summary className="cursor-pointer text-sm">View saved value</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
              {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
            </pre>
          </details>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              let copy = 1;
              while (Object.hasOwn(record.values, `Saved ${field.label} ${copy}`)) copy++;
              onChange({
                ...record,
                values: {
                  ...record.values,
                  [`Saved ${field.label} ${copy}`]: value,
                  [field.id]: null,
                },
              });
            }}
          >
            Keep saved value and start this field
          </Button>
          <p className="text-xs text-muted-foreground">
            The previous value will remain under Saved fields not used by this schema.
          </p>
        </section>
      );
    if (field.kind === "record" || field.kind === "records") {
      const records =
        value === undefined || value === null
          ? []
          : field.kind === "record"
            ? [Schema.decodeUnknownSync(ContentRecord)(value)]
            : Schema.decodeUnknownSync(Schema.Array(ContentRecord))(value);
      const set = (next: readonly ContentRecord[]) =>
        change(field, field.kind === "record" ? (next[0] ?? null) : next);
      return (
        <EditorDisclosure
          key={field.id}
          title={field.label}
          summary={`${records.length} ${records.length === 1 ? "entry" : "entries"}`}
          defaultOpen={records.length === 0}
          revealKey={records
            .filter((child) => !initialEntries.has(child.id))
            .map((child) => child.id)
            .join("/")}
        >
          {records.map((child, index) => (
            <EditorDisclosure
              key={child.id}
              title={recordTitle(child, field.label)}
              defaultOpen={!initialEntries.has(child.id)}
            >
              <SchemaRecordFields
                bundle={bundle}
                record={child}
                disabled={disabled}
                onEvidence={onEvidence}
                onChange={(next) =>
                  set(records.map((item) => (item.id === child.id ? next : item)))
                }
              />
              <RowActions
                label={`${field.label} ${index + 1}`}
                index={index}
                count={records.length}
                disabled={disabled}
                onMove={(delta) => set(move(records, index, delta))}
                onRemove={() => set(records.filter((item) => item.id !== child.id))}
              />
            </EditorDisclosure>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={disabled || records.length >= (field.kind === "record" ? 1 : 100)}
            onClick={() =>
              set([
                ...records,
                { id: newId(), schema: field.schema, layout: field.defaultLayout, values: {} },
              ])
            }
          >
            <Plus />
            Add{" "}
            {bundle.schemas.find((item) => sameSchema(item, field.schema))?.name.toLowerCase() ??
              "entry"}
          </Button>
          <SavedEntryPicker
            schema={field.schema}
            layout={field.defaultLayout}
            disabled={disabled || records.length >= (field.kind === "record" ? 1 : 100)}
            onPick={(entry, evidence) => {
              const value = latestRecord.current.values[field.id];
              const current = Schema.decodeUnknownSync(Schema.Array(ContentRecord))(
                value === undefined || value === null
                  ? []
                  : field.kind === "record"
                    ? [value]
                    : value,
              );
              if (current.length >= (field.kind === "record" ? 1 : 100))
                throw new Error("This field has reached its entry limit.");
              set([
                ...current,
                current.some((item) => item.id === entry.id) ? { ...entry, id: newId() } : entry,
              ]);
              onEvidence?.(evidence);
            }}
          />
        </EditorDisclosure>
      );
    }
    if (field.kind === "list") {
      const values =
        value === undefined || value === null
          ? []
          : Schema.decodeUnknownSync(Schema.Array(Schema.Json))(value);
      if (field.items === "skill")
        return (
          <SkillOptions
            key={field.id}
            values={values.filter((item): item is string => typeof item === "string")}
            disabled={disabled}
            onChange={(next, evidence) => {
              change(field, next);
              onEvidence?.(evidence);
            }}
          />
        );
      return (
        <ScalarListField
          key={field.id}
          field={field}
          values={values}
          disabled={disabled}
          onChange={(next) => change(field, next)}
        />
      );
    }
    return (
      <ScalarControl
        key={field.id}
        kind={field.kind}
        label={field.label}
        required={field.required}
        value={value}
        disabled={disabled}
        onChange={(next) => change(field, next)}
      />
    );
  };
  const essential = (field: ContentSchemaField) =>
    field.required ||
    field.kind === "records" ||
    field.kind === "record" ||
    field.kind === "list" ||
    ["email", "startDate", "endDate", "issuedDate", "expirationDate", "description"].includes(
      field.id,
    );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-5">
        {definition.fields.filter(essential).map((field) => (
          <div key={field.id} className={field.kind === "date" ? "min-w-0" : "col-span-2 min-w-0"}>
            {renderField(field)}
          </div>
        ))}
      </div>
      <EditorDisclosure title="Additional settings">
        {definition.fields.filter((field) => !essential(field)).map(renderField)}
        {Object.keys(record.values).some(
          (key) => key !== schemaHistoryKey && !definition.fields.some((field) => field.id === key),
        ) && (
          <details className="rounded-md border p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Saved fields not used by this schema
            </summary>
            <p className="mt-3 text-sm text-muted-foreground">
              These values are preserved. Copy a value into a compatible field when needed.
            </p>
            <dl className="mt-3 space-y-3">
              {Object.entries(record.values)
                .filter(
                  ([key]) =>
                    key !== schemaHistoryKey &&
                    !definition.fields.some((field) => field.id === key),
                )
                .map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-sm font-medium">{key}</dt>
                    <dd className="whitespace-pre-wrap break-words text-sm">
                      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                    </dd>
                  </div>
                ))}
            </dl>
          </details>
        )}
        {definition.level === "entry" && definition.id !== "contact-link" && (
          <EvidenceFill
            bundle={bundle}
            record={record}
            disabled={disabled}
            onApply={(next, evidence) => {
              onChange(next);
              onEvidence?.(evidence);
            }}
          />
        )}
        <FormField label="Layout">
          <select
            className={selectClass}
            disabled={disabled}
            value={schemaKey(record.layout)}
            onChange={(event) => {
              const layout = bundle.layouts.find((item) => schemaKey(item) === event.target.value);
              if (layout)
                onChange({ ...record, layout: { id: layout.id, revision: layout.revision } });
            }}
          >
            {!bundle.layouts.some(
              (layout) =>
                sameSchema(layout, record.layout) && sameSchema(layout.schema, record.schema),
            ) && <option value={schemaKey(record.layout)}>Choose a compatible layout</option>}
            {bundle.layouts
              .filter((layout) => sameSchema(layout.schema, record.schema))
              .map((layout) => (
                <option value={schemaKey(layout)} key={schemaKey(layout)}>
                  {layout.name}
                </option>
              ))}
          </select>
        </FormField>
      </EditorDisclosure>
    </div>
  );
}
export function StructuredFields({
  content,
  onChange,
  disabled = false,
}: {
  content: StructuredContent;
  onChange: (content: StructuredContent) => void;
  disabled?: boolean;
}) {
  const latest = useRef(content);
  latest.current = content;
  const update = (next: StructuredContent) => {
    latest.current = next;
    onChange(next);
  };
  return (
    <SchemaRecordFields
      bundle={content}
      record={content.record}
      onChange={(record) => update({ ...latest.current, record })}
      onEvidence={(evidence) =>
        update({
          ...latest.current,
          evidence: [
            ...new Map(
              [...latest.current.evidence, ...evidence].map((ref) => [ref.claimId, ref]),
            ).values(),
          ],
        })
      }
      disabled={disabled}
    />
  );
}
