import {
  addLayout,
  addTemplateField,
  changeDefinition,
  changeLayout,
  emptyDefinition,
  type LayoutNode,
  layoutPath,
  moveLayout,
  newIdentity,
  type TemplateField,
  type VisualStyle,
  valueKindSchema,
} from "@river/domain/workspace";
import { ArrowDown, ArrowUp, Columns2, Plus, Rows2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { inputClass } from "~/components/workspace/value-input";
import type { EditorSelection } from "./projection";
import type { EditorController } from "./use-editor-controller";

function LayoutTree({
  node,
  depth = 0,
  selected,
  onSelect,
}: {
  node: LayoutNode;
  depth?: number;
  selected: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <button
        type="button"
        aria-pressed={selected === node.id}
        className={selected === node.id ? "bg-primary/10 text-primary" : ""}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onSelect(node.id)}
      >
        {node.kind === "field"
          ? node.fieldKey
          : node.kind === "literal"
            ? `“${node.text || "Label"}”`
            : node.kind === "row"
              ? "▥ Row"
              : "▤ Column"}
      </button>
      {"children" in node &&
        node.children.map((child) => (
          <LayoutTree
            key={child.id}
            node={child}
            depth={depth + 1}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}
export function TemplateInspector({ controller: c }: { controller: EditorController }) {
  const template = c.resume.template.document;
  const [definitionId, setDefinitionId] = useState(template.definitions[0]?.id ?? ""),
    [newField, setNewField] = useState(false),
    [label, setLabel] = useState(""),
    [kind, setKind] = useState<TemplateField["type"]>("text"),
    [repeat, setRepeat] = useState(false),
    [nested, setNested] = useState("");
  const definition =
    template.definitions.find((item) => item.id === (c.selected?.definitionId ?? definitionId)) ??
    template.definitions[0];
  if (!definition) return null;
  const selectedId =
    c.selected?.definitionId === definition.id ? c.selected.layoutId : definition.layout.id;
  const path = layoutPath(definition.layout, selectedId),
    node = path.at(-1) ?? definition.layout;
  const field =
    node.kind === "field"
      ? definition.fields.find((field) => field.key === node.fieldKey)
      : undefined;
  const select = (id: string) => {
    const selection: EditorSelection = {
      id: `inspector:${id}`,
      definitionId: definition.id,
      layoutId: id,
      contentId: "",
    };
    c.commands.select(selection);
  };
  const change = (update: (node: LayoutNode) => LayoutNode) =>
    c.updateTemplate((template) =>
      changeDefinition(template, definition.id, (definition) => ({
        ...definition,
        layout: changeLayout(definition.layout, node.id, update),
      })),
    );
  const style = (patch: VisualStyle) =>
    c.updateTemplate((template) =>
      (c.selection.length
        ? c.selection
        : [{ definitionId: definition.id, layoutId: node.id }]
      ).reduce(
        (template, item) =>
          changeDefinition(template, item.definitionId, (definition) => ({
            ...definition,
            layout: changeLayout(definition.layout, item.layoutId, (node) => ({
              ...node,
              style: { ...node.style, ...patch },
            })),
          })),
        template,
      ),
    );
  const parent =
    node.kind === "row" || node.kind === "column"
      ? node.id
      : (path.at(-2)?.id ?? definition.layout.id);
  const containers = (root: LayoutNode): LayoutNode[] =>
    "children" in root ? [root, ...root.children.flatMap(containers)] : [];
  const updateField = (patch: Partial<TemplateField>) =>
    c.updateTemplate((template) =>
      changeDefinition(template, definition.id, (definition) => ({
        ...definition,
        fields: definition.fields.map((item) =>
          item.id === field?.id ? { ...item, ...patch } : item,
        ),
      })),
    );
  return (
    <aside className="visual-inspector space-y-5" aria-label="Template controls">
      <div>
        <p className="text-xs uppercase text-muted-foreground">Layout definition</p>
        <select
          aria-label="Entry structure"
          className={`${inputClass} mt-2`}
          value={definition.id}
          onChange={(event) => {
            setDefinitionId(event.target.value);
            c.setSelection([]);
          }}
        >
          {template.definitions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <h2 className="mt-3 font-serif text-2xl font-normal">{definition.label}</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          One structure, shared by every entry of this type.
        </p>
      </div>
      <label className="block text-xs">
        Preview entries
        <select
          aria-label="Preview entries"
          className={`${inputClass} mt-2`}
          value={c.samples}
          onChange={(event) => c.setSamples(Number(event.target.value))}
        >
          {[1, 2, 3].map((count) => (
            <option key={count} value={count}>
              {count} {count === 1 ? "entry" : "entries"}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="mb-2 text-xs">Structure</p>
        <div className="visual-tree">
          <LayoutTree node={definition.layout} selected={node.id} onSelect={select} />
        </div>
      </div>
      <nav className="flex flex-wrap gap-1" aria-label="Selection breadcrumbs">
        {path.map((item) => (
          <button
            type="button"
            key={item.id}
            className="rounded border px-1.5 py-1 text-[10px]"
            onClick={() => select(item.id)}
          >
            {item.kind === "field" ? item.fieldKey : item.kind}
          </button>
        ))}
      </nav>
      <div className="flex flex-wrap gap-2">
        {(["row", "column", "literal"] as const).map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant="outline"
            onClick={() =>
              c.updateTemplate((template) =>
                changeDefinition(template, definition.id, (definition) =>
                  addLayout(definition, parent, kind),
                ),
              )
            }
          >
            {kind === "row" ? <Columns2 /> : kind === "column" ? <Rows2 /> : <Plus />}
            {kind === "literal" ? "Label" : kind}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => setNewField(!newField)}>
          <Plus />
          Field
        </Button>
      </div>
      {newField && (
        <form
          className="space-y-3 rounded border bg-muted/20 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!label.trim()) return;
            let key = label
              .trim()
              .replace(/[^a-zA-Z0-9]+(.)/g, (_, character: string) => character.toUpperCase());
            key = key.charAt(0).toLowerCase() + key.slice(1);
            if (definition.fields.some((field) => field.key === key))
              key += `_${definition.fields.length}`;
            const created = kind === "group" && !nested ? emptyDefinition(label) : null;
            c.updateTemplate((template) =>
              changeDefinition(
                {
                  ...template,
                  definitions: created ? [...template.definitions, created] : template.definitions,
                },
                definition.id,
                (definition) =>
                  addTemplateField(
                    definition,
                    {
                      id: newIdentity(),
                      key,
                      label: label.trim(),
                      type: kind,
                      repeat,
                      required: false,
                      prefix: "",
                      suffix: "",
                      separator: "",
                      dateFormat: "short",
                      ...(kind === "group" ? { definitionId: created?.id ?? nested } : {}),
                    },
                    parent,
                  ),
              ),
            );
            setLabel("");
            setNewField(false);
          }}
        >
          <label className="block text-xs">
            Field label
            <input
              required
              className={`${inputClass} mt-1`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label className="block text-xs">
            Data type
            <select
              className={`${inputClass} mt-1`}
              value={kind}
              onChange={(event) => {
                const kind = event.target.value;
                setKind(kind === "group" ? kind : valueKindSchema.parse(kind));
              }}
            >
              {[...valueKindSchema.options, "group"].map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(event) => setRepeat(event.target.checked)}
            />
            Repeating collection
          </label>
          {kind === "group" && (
            <select
              aria-label="Nested entry layout"
              className={inputClass}
              value={nested}
              onChange={(event) => setNested(event.target.value)}
            >
              <option value="">New entry structure</option>
              {template.definitions
                .filter((item) => item.id !== definition.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
            </select>
          )}
          <Button size="sm" type="submit">
            Add field
          </Button>
        </form>
      )}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => c.moveBy(-1)} disabled={!c.selected}>
          <ArrowUp />
          Up
        </Button>
        <Button variant="outline" size="sm" onClick={() => c.moveBy(1)} disabled={!c.selected}>
          <ArrowDown />
          Down
        </Button>
      </div>
      {node.id !== definition.layout.id && (
        <>
          <label className="block text-xs">
            Move into
            <select
              aria-label="Move into container"
              className={`${inputClass} mt-2`}
              value=""
              onChange={(event) => {
                if (event.target.value)
                  c.updateTemplate((template) =>
                    changeDefinition(template, definition.id, (definition) => ({
                      ...definition,
                      layout: moveLayout(definition.layout, node.id, event.target.value, "inside"),
                    })),
                  );
              }}
            >
              <option value="">Choose a container…</option>
              {containers(definition.layout)
                .filter((item) => !layoutPath(node, item.id).length)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {layoutPath(definition.layout, item.id)
                      .map((item) => item.kind)
                      .join(" / ")}
                  </option>
                ))}
            </select>
          </label>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              select(node.id);
              c.remove();
            }}
          >
            <Trash2 />
            {"children" in node ? "Unwrap container" : "Delete selected block"}
          </Button>
        </>
      )}
      {node.kind === "literal" && (
        <>
          <label className="block text-xs">
            Template label
            <input
              className={`${inputClass} mt-1`}
              value={node.text}
              onChange={(event) =>
                change((node) =>
                  node.kind === "literal" ? { ...node, text: event.target.value } : node,
                )
              }
            />
          </label>
          <label className="block text-xs">
            Only show with
            <select
              className={`${inputClass} mt-1`}
              value={node.whenField ?? ""}
              onChange={(event) =>
                change((node) =>
                  node.kind === "literal"
                    ? { ...node, whenField: event.target.value || undefined }
                    : node,
                )
              }
            >
              <option value="">Always</option>
              {definition.fields.map((field) => (
                <option key={field.id} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {node.kind === "row" && (
        <label className="block text-xs">
          Separator between populated fields
          <input
            className={`${inputClass} mt-1`}
            value={node.separator ?? ""}
            placeholder="e.g. –"
            onChange={(event) =>
              change((node) =>
                node.kind === "row" ? { ...node, separator: event.target.value } : node,
              )
            }
          />
        </label>
      )}
      {field && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {field.key} · {field.type}
            {field.repeat ? " collection" : ""}
          </p>
          <label className="block text-xs">
            Display label
            <input
              className={`${inputClass} mt-1`}
              value={field.label}
              onChange={(event) => updateField({ label: event.target.value || "Untitled field" })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["prefix", "suffix"] as const).map((key) => (
              <label key={key} className="text-xs">
                {key}
                <input
                  className={`${inputClass} mt-1`}
                  value={field[key]}
                  onChange={(event) => updateField({ [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
          {field.repeat && (
            <label className="block text-xs">
              Between items
              <input
                className={`${inputClass} mt-1`}
                value={field.separator}
                onChange={(event) => updateField({ separator: event.target.value })}
              />
            </label>
          )}
          {field.type === "date" && (
            <label className="block text-xs">
              Date format
              <select
                className={`${inputClass} mt-1`}
                value={field.dateFormat}
                onChange={(event) => {
                  const format = event.target.value;
                  if (format === "short" || format === "long" || format === "numeric")
                    updateField({ dateFormat: format });
                }}
              >
                <option value="short">Jan 2024</option>
                <option value="long">January 2024</option>
                <option value="numeric">2024-01</option>
              </select>
            </label>
          )}
          <label className="flex gap-2 text-xs">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) => updateField({ required: event.target.checked })}
            />
            Warn when empty
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 border-t pt-4">
        <label className="text-xs">
          Font
          <select
            className={`${inputClass} mt-1`}
            value={node.style.fontFamily ?? ""}
            onChange={(event) =>
              style({
                fontFamily:
                  event.target.value === "serif"
                    ? "serif"
                    : event.target.value === "sans"
                      ? "sans"
                      : undefined,
              })
            }
          >
            <option value="">Inherit</option>
            <option value="sans">Instrument Sans</option>
            <option value="serif">Newsreader</option>
          </select>
        </label>
        {(["fontSize", "gap", "padding", "grow", "width"] as const).map((key) => (
          <label key={key} className="text-xs">
            {key === "fontSize"
              ? "Size (pt)"
              : key === "grow"
                ? "Width weight"
                : key === "width"
                  ? "Width (pt)"
                  : key}
            <input
              type="number"
              className={`${inputClass} mt-1`}
              min={key === "fontSize" ? 6 : key === "width" ? 1 : 0}
              max={key === "width" ? 600 : key === "grow" ? 20 : 72}
              value={node.style[key] ?? ""}
              placeholder="Inherit"
              onChange={(event) =>
                style({ [key]: event.target.value === "" ? undefined : Number(event.target.value) })
              }
            />
          </label>
        ))}
        <label className="text-xs">
          Weight
          <select
            className={`${inputClass} mt-1`}
            value={node.style.weight ?? "normal"}
            onChange={(event) =>
              style({ weight: event.target.value === "bold" ? "bold" : "normal" })
            }
          >
            <option value="normal">Regular</option>
            <option value="bold">Bold</option>
          </select>
        </label>
        <label className="text-xs">
          Alignment
          <select
            className={`${inputClass} mt-1`}
            value={node.style.align ?? "left"}
            onChange={(event) => {
              const align = event.target.value;
              if (align === "left" || align === "center" || align === "right") style({ align });
            }}
          >
            <option>left</option>
            <option>center</option>
            <option>right</option>
          </select>
        </label>
        <label className="text-xs">
          Color
          <input
            type="color"
            className="mt-1 block h-9 w-full"
            value={node.style.color ?? "#111318"}
            onChange={(event) => style({ color: event.target.value })}
          />
        </label>
      </div>
      <div className="flex flex-col gap-2 text-xs">
        {(["italic", "borderBottom", "keepTogether"] as const).map((key) => (
          <label key={key} className="flex gap-2">
            <input
              type="checkbox"
              checked={node.style[key] ?? false}
              onChange={(event) => style({ [key]: event.target.checked })}
            />
            {key === "borderBottom"
              ? "Bottom rule"
              : key === "keepTogether"
                ? "Keep together on PDF page"
                : "Italic"}
          </label>
        ))}
      </div>
    </aside>
  );
}
