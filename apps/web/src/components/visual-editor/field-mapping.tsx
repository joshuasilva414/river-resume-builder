import {
  type ContentNode,
  type EntryDefinition,
  mapIntoDefinition,
  type VisualTemplate,
} from "@river/domain/workspace";
import { inputClass, ValueText } from "~/components/workspace/value-input";

/** The same mapping UI handles a whole section, an entry, or an individual field. */
export function FieldMapping({
  nodes,
  definition,
  template,
  mapping,
  onChange,
}: {
  nodes: ContentNode[];
  definition: EntryDefinition;
  template: VisualTemplate;
  mapping: Record<string, string>;
  onChange: (mapping: Record<string, string>) => void;
}) {
  return (
    <div className="space-y-3">
      {nodes.map((node) => {
        const automatic = mapIntoDefinition([node], definition).accepted[0]?.key ?? "";
        const key = mapping[node.id] ?? automatic;
        const target = definition.fields.find((field) => field.key === key);
        const nested = template.definitions.find((item) => item.id === target?.definitionId);
        return (
          <div key={node.id} className="space-y-2 rounded border p-3 text-xs">
            <label className="block space-y-2">
              <span>{node.label}</span>
              {node.kind === "field" && (
                <span className="block truncate text-muted-foreground">
                  <ValueText value={node.value} />
                </span>
              )}
              <select
                className={inputClass}
                value={key}
                onChange={(event) => onChange({ ...mapping, [node.id]: event.target.value })}
              >
                <option value="">Keep as unused content</option>
                {definition.fields
                  .filter((field) =>
                    node.kind === "group" ? field.type === "group" : field.type === node.value.kind,
                  )
                  .map((field) => (
                    <option key={field.id} value={field.key}>
                      {field.label}
                      {field.repeat ? " (collection)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            {node.kind === "group" && nested && (
              <details open>
                <summary className="cursor-pointer py-1">Fields in {node.label}</summary>
                <FieldMapping
                  nodes={node.children}
                  definition={nested}
                  template={template}
                  mapping={mapping}
                  onChange={onChange}
                />
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
