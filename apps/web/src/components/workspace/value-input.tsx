import {
  dateValueSchema,
  type FieldValue,
  formatDate,
  plainRichText,
  valueSpans,
} from "@river/domain/workspace";
import { useState } from "react";
import { RichTextInput } from "./rich-text";
export const inputClass =
  "w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary";
export function ValueInput({
  value,
  onChange,
  label = "Value",
}: {
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  label?: string;
}) {
  switch (value.kind) {
    case "text":
    case "bullet":
      return (
        <RichTextInput
          value={value.value ?? []}
          label={label}
          onChange={(spans) => onChange({ ...value, value: spans })}
        />
      );
    case "skill":
      return (
        <input
          className={inputClass}
          aria-label={label}
          value={value.value ?? ""}
          onChange={(event) => onChange({ kind: "skill", value: event.target.value })}
        />
      );
    case "number":
      return (
        <input
          className={inputClass}
          aria-label={label}
          type="number"
          step="any"
          value={value.value ?? ""}
          onChange={(event) =>
            onChange({
              kind: "number",
              value: event.target.value === "" ? null : Number(event.target.value),
            })
          }
        />
      );
    case "boolean":
      return (
        <select
          className={inputClass}
          aria-label={label}
          value={value.value === null ? "" : String(value.value)}
          onChange={(event) =>
            onChange({
              kind: "boolean",
              value: event.target.value === "" ? null : event.target.value === "true",
            })
          }
        >
          <option value="">Not set</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    case "date":
      return (
        <DateInput
          key={JSON.stringify(value.value)}
          value={value}
          onChange={onChange}
          label={label}
        />
      );
    case "link":
      return (
        <div className="flex flex-col gap-2">
          <input
            aria-label={`${label} label`}
            className={inputClass}
            placeholder="Display text"
            value={value.value?.label ?? ""}
            onChange={(event) =>
              onChange({
                kind: "link",
                value: { href: value.value?.href ?? "", label: event.target.value },
              })
            }
          />
          <input
            aria-label={`${label} URL`}
            className={inputClass}
            placeholder="https://…"
            value={value.value?.href ?? ""}
            onChange={(event) =>
              onChange({
                kind: "link",
                value: { label: value.value?.label ?? "", href: event.target.value },
              })
            }
          />
        </div>
      );
  }
}
function DateInput({
  value,
  onChange,
  label,
}: {
  value: Extract<FieldValue, { kind: "date" }>;
  onChange: (value: FieldValue) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(value.value ? formatDate(value.value, "numeric") : "");
  const parse = (text: string) => {
    if (!text.trim()) return null;
    if (text.trim().toLowerCase() === "present") return { precision: "present" as const };
    const parts = text.split("-").map(Number);
    return dateValueSchema.parse(
      parts.length === 1
        ? { precision: "year", year: parts[0] }
        : parts.length === 2
          ? { precision: "month", year: parts[0], month: parts[1] }
          : { precision: "day", year: parts[0], month: parts[1], day: parts[2] },
    );
  };
  return (
    <input
      className={inputClass}
      aria-label={label}
      placeholder="YYYY, YYYY-MM, YYYY-MM-DD, or Present"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        try {
          parse(event.target.value);
          event.target.setCustomValidity("");
        } catch {
          event.target.setCustomValidity("Enter a valid year, month, full date, or Present.");
        }
      }}
      onBlur={(event) => {
        try {
          onChange({ kind: "date", value: parse(event.target.value) });
        } catch {
          event.target.reportValidity();
        }
      }}
    />
  );
}
export function ValueText({ value }: { value: FieldValue }) {
  return (
    <>
      {valueSpans(value)
        .map((span) => span.text)
        .join("")}
    </>
  );
}
export function textValue(text: string): FieldValue {
  return { kind: "text", value: plainRichText(text) };
}
