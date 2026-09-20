import {
  blankGroup,
  blankValue,
  type ContentNode,
  changeDefinition,
  findContent,
  layoutPath,
  mapContent,
  moveLayout,
  moveSibling,
  newIdentity,
  parseTemplate,
  type Resume,
  removeLayout,
  type VisualTemplate,
} from "@river/domain/workspace";
import { useMemo, useRef, useState } from "react";
import type { CanvasCommands } from "./canvas";
import { templatePreview } from "./preview-fixtures";
import { contentPath, type EditorSelection } from "./projection";
import { type EditorRecord, useWorkspaceDraft } from "./use-draft";

export function useEditorController(initial: EditorRecord, ownerId: string) {
  const draft = useWorkspaceDraft(initial, ownerId);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [selection, setSelection] = useState<EditorSelection[]>([]),
    [editing, setEditing] = useState<string | null>(null),
    [samples, setSamples] = useState(2),
    [suggestionTarget, setSuggestionTarget] = useState<string | null>(null);
  const drag = useRef<(() => void) | null>(null);
  const mode = draft.payload.kind;
  const resume = useMemo(
    () =>
      draft.payload.kind === "resume"
        ? draft.payload.data
        : templatePreview(draft.payload.data, samples),
    [draft.payload, samples],
  );
  const updateTemplate = (update: (template: VisualTemplate) => VisualTemplate, group?: string) =>
    draft.change(
      (payload) =>
        payload.kind === "template"
          ? (() => {
              try {
                const data = parseTemplate(update(payload.data));
                setCommandError(null);
                return { ...payload, data };
              } catch {
                setCommandError(
                  "This change would create an invalid or circular template. Choose another container or entry structure.",
                );
                return payload;
              }
            })()
          : payload,
      group,
    );
  const updateResume = (update: (resume: Resume) => Resume, group?: string) =>
    draft.change(
      (payload) =>
        payload.kind === "resume" ? { ...payload, data: update(payload.data) } : payload,
      group,
    );
  const select = (item: EditorSelection, additive = false) => {
    setEditing(null);
    setSelection((previous) =>
      additive
        ? previous.some((existing) => existing.id === item.id)
          ? previous.filter((existing) => existing.id !== item.id)
          : [...previous, item]
        : [item],
    );
  };
  const move: CanvasCommands["move"] = (source, target, position, section) => {
    if (mode === "template")
      updateTemplate((template) =>
        section
          ? {
              ...template,
              sections: reorder(
                template.sections,
                resume.sections.find((item) => item.id === source.contentId)?.key,
                resume.sections.find((item) => item.id === target)?.key,
                position,
              ),
            }
          : changeDefinition(template, source.definitionId, (definition) => ({
              ...definition,
              layout: moveLayout(definition.layout, source.layoutId, target, position),
            })),
      );
    else
      updateResume((resume) => ({
        ...resume,
        sections: moveSibling(resume.sections, source.contentId, target, position === "after"),
      }));
  };
  const add: CanvasCommands["add"] = (groupId, key) => {
    updateResume((resume) => ({
      ...resume,
      sections: mapContent(resume.sections, groupId, (node) => {
        if (node.kind !== "group") return node;
        const field = resume.template.document.definitions
          .find((definition) => definition.id === node.definitionId)
          ?.fields.find((field) => field.key === key);
        if (!field?.repeat) return node;
        const child: ContentNode =
          field.type === "group" && field.definitionId
            ? blankGroup(resume.template.document, field.definitionId, field.key, field.label)
            : {
                kind: "field",
                id: newIdentity(),
                key: field.key,
                label: field.label,
                factIds: [],
                value: blankValue(field.type === "group" ? "text" : field.type),
              };
        return { ...node, children: [...node.children, child] };
      }),
    }));
  };
  const remove = () => {
    if (mode === "template")
      updateTemplate((template) =>
        selection.reduce((current, item) => {
          const section = resume.sections.find((section) => section.id === item.contentId);
          if (section) {
            return {
              // biome-ignore lint/performance/noAccumulatingSpread: A fixed-size template envelope must remain immutable for undo snapshots.
              ...current,
              sections: current.sections.filter((item) => item.key !== section.key),
            };
          }
          return changeDefinition(current, item.definitionId, (definition) => {
            const target = layoutPath(definition.layout, item.layoutId).at(-1);
            if (!target || target.id === definition.layout.id) return definition;
            return {
              ...definition,
              fields:
                target.kind === "field"
                  ? definition.fields.filter((field) => field.key !== target.fieldKey)
                  : definition.fields,
              layout: removeLayout(definition.layout, item.layoutId),
            };
          });
        }, template),
      );
    else
      updateResume((resume) => ({
        ...resume,
        sections: selection.reduce(
          (nodes, item) =>
            mapContent(nodes, item.contentId, (node) => {
              if (node.kind === "group") return null;
              const parent = contentPath(nodes, node.id).at(-2),
                field =
                  parent?.kind === "group"
                    ? resume.template.document.definitions
                        .find((definition) => definition.id === parent.definitionId)
                        ?.fields.find((field) => field.key === node.key)
                    : undefined;
              return field?.repeat ? null : { ...node, value: blankValue(node.value.kind) };
            }),
          resume.sections,
        ),
      }));
    setSelection([]);
    setEditing(null);
  };
  const moveBy = (direction: -1 | 1) => {
    const source = selection[0];
    if (!source) return;
    if (mode === "template") {
      const definition = resume.template.document.definitions.find(
        (item) => item.id === source.definitionId,
      );
      const parent = definition ? layoutPath(definition.layout, source.layoutId).at(-2) : undefined;
      if (parent?.kind === "row" || parent?.kind === "column") {
        const target =
          parent.children[
            parent.children.findIndex((item) => item.id === source.layoutId) + direction
          ];
        if (target) move(source, target.id, direction < 0 ? "before" : "after", false);
      }
    } else {
      const path = contentPath(resume.sections, source.contentId),
        parent = path.at(-2),
        node = path.at(-1),
        siblings =
          parent?.kind === "group"
            ? parent.children.filter((item) => item.key === node?.key)
            : resume.sections;
      const target =
        siblings[siblings.findIndex((item) => item.id === source.contentId) + direction];
      if (target) move(source, target.id, direction < 0 ? "before" : "after", !parent);
    }
  };
  const commands: CanvasCommands = {
    mode,
    resume,
    selection,
    editing,
    select,
    edit: setEditing,
    drag,
    move,
    add,
    suggest: setSuggestionTarget,
    setValue: (id, value) =>
      updateResume(
        (resume) => ({
          ...resume,
          sections: mapContent(resume.sections, id, (node) =>
            node.kind === "field" ? { ...node, value } : node,
          ),
        }),
        `field:${id}`,
      ),
  };
  const selected = selection[0],
    content = selected ? findContent(resume.sections, selected.contentId) : undefined;
  return {
    draft,
    commandError,
    mode,
    resume,
    selection,
    setSelection,
    editing,
    setEditing,
    samples,
    setSamples,
    commands,
    updateTemplate,
    updateResume,
    remove,
    moveBy,
    suggestionTarget,
    setSuggestionTarget,
    selected,
    content,
  };
}
function reorder<T extends { key: string }>(
  items: T[],
  source: string | undefined,
  target: string | undefined,
  position: "before" | "after",
) {
  const node = items.find((item) => item.key === source);
  if (!node || source === target || !items.some((item) => item.key === target)) return items;
  const next = items.filter((item) => item !== node);
  next.splice(
    next.findIndex((item) => item.key === target) + Number(position === "after"),
    0,
    node,
  );
  return next;
}
export type EditorController = ReturnType<typeof useEditorController>;
