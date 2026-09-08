import {
  ContentRecord,
  type ContentSchemaField,
  canonicalJson,
  type EvidenceReference,
  newId,
  PartialDate,
  type SchemaBundle,
  type StructuredContent,
  sameSchema,
  schemaKey,
} from "@river/domain";
import { Schema } from "effect";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { FormField, selectClass } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { EvidenceFill, SkillOptions } from "./evidence-fill";
import { SavedEntryPicker } from "./saved-entry-picker";
import { schemaHistoryKey } from "./schema-transition";

type ScalarKind = "text" | "number" | "date" | "boolean" | "skill";
function DateControl({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: Schema.Json | undefined;
  onChange: (value: Schema.Json) => void;
  disabled: boolean;
}) {
  const decoded = Schema.decodeUnknownOption(PartialDate)(value);
  const date = decoded._tag === "Some" ? decoded.value : undefined;
  const [chosenPrecision, setChosenPrecision] = useState("month");
  const precision = date?.kind ?? chosenPrecision;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label={`${label} precision`}
          className={selectClass}
          value={precision}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            setChosenPrecision(next);
            if (next === "present") onChange({ kind: "present" });
            else if (next === "year" && (date?.kind === "year" || date?.kind === "month"))
              onChange({ kind: "year", year: date.year });
            else if (next === "year" && date?.kind === "day")
              onChange({ kind: "year", year: Number(date.value.slice(0, 4)) });
            else if (next === "month" && date?.kind === "day")
              onChange({
                kind: "month",
                year: Number(date.value.slice(0, 4)),
                month: Number(date.value.slice(5, 7)),
              });
            else onChange(null);
          }}
        >
          <option value="year">Year</option>
          <option value="month">Month and year</option>
          <option value="day">Full date</option>
          <option value="present">Present</option>
          {precision === "legacy" && <option value="legacy">Existing date text</option>}
        </select>
        {precision !== "present" && (
          <Input
            aria-label={label}
            disabled={disabled}
            type={
              precision === "year"
                ? "number"
                : precision === "month"
                  ? "month"
                  : precision === "day"
                    ? "date"
                    : "text"
            }
            min={precision === "year" ? 1 : undefined}
            max={precision === "year" ? 9999 : undefined}
            value={
              date?.kind === "year"
                ? date.year
                : date?.kind === "month"
                  ? `${date.year}-${String(date.month).padStart(2, "0")}`
                  : date?.kind === "day"
                    ? date.value
                    : date?.kind === "legacy"
                      ? date.text
                      : ""
            }
            onChange={(event) => {
              const text = event.target.value;
              if (!text) return onChange(null);
              if (precision === "year") onChange({ kind: "year", year: Number(text) });
              else if (precision === "month") {
                const [year, month] = text.split("-").map(Number);
                if (year && month) onChange({ kind: "month", year, month });
              } else if (precision === "day") onChange({ kind: "day", value: text });
              else onChange({ kind: "legacy", text });
            }}
          />
        )}
        {date && (
          <Button type="button" variant="ghost" disabled={disabled} onClick={() => onChange(null)}>
            Clear
          </Button>
        )}
      </div>
    </fieldset>
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
    return <DateControl label={label} value={value} onChange={onChange} disabled={disabled} />;
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
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{field.label}</h3>
      {rows.map((row, index) => (
        <div key={row.id} className="space-y-2 rounded-sm border p-3">
          <ScalarControl
            kind={field.items}
            label={`${field.label} ${index + 1}`}
            required={false}
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
    </section>
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
  return (
    <div className="space-y-5">
      {definition.fields.map((field) => {
        const value = record.values[field.id];
        const shapeProblem = fieldShapeProblem(field, value);
        if (shapeProblem && value !== undefined)
          return (
            <section key={field.id} className="space-y-3 rounded-md border p-4">
              <h3 className="text-sm font-semibold">{field.label}</h3>
              <p role="alert" className="text-sm">
                {shapeProblem} Keep this value and switch back to its fields, or start a new value
                for this definition.
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
            <section className="space-y-4 rounded-md border p-5" key={field.id}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-editorial text-2xl">{field.label}</h3>
                <span className="text-sm text-muted-foreground">{records.length}</span>
              </div>
              {records.map((child, index) => (
                <div className="space-y-4 border-b pb-5" key={child.id}>
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
                </div>
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
                {bundle.schemas
                  .find((item) => sameSchema(item, field.schema))
                  ?.name.toLowerCase() ?? "entry"}
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
                    current.some((item) => item.id === entry.id)
                      ? { ...entry, id: newId() }
                      : entry,
                  ]);
                  onEvidence?.(evidence);
                }}
              />
            </section>
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
      })}
      {Object.keys(record.values).some(
        (key) => key !== schemaHistoryKey && !definition.fields.some((field) => field.id === key),
      ) && (
        <details className="rounded-md border p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Saved fields not used by this schema
          </summary>
          <p className="mt-3 text-sm text-muted-foreground">
            These values are preserved. Restore previous fields and values to return to an earlier
            definition, or copy a value into a compatible field.
          </p>
          <dl className="mt-3 space-y-3">
            {Object.entries(record.values)
              .filter(
                ([key]) =>
                  key !== schemaHistoryKey && !definition.fields.some((field) => field.id === key),
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
