/** DEMO ONLY: manipulates the local visual layout tree, never River's saved templates. */
import {
  ArrowDown,
  ArrowUp,
  Columns2,
  CornerDownRight,
  GripVertical,
  Rows2,
  Trash2,
} from "lucide-react";
import { type DemoDragRef, demoStartDrag } from "./demo-drag";
import type { DemoSelection } from "./demo-editor";
import {
  type DemoLayoutNode,
  type DemoLayouts,
  type DemoStyle,
  demoBaseStyle,
  demoFindNode,
  demoMoveNode,
  demoNewId,
  demoNodeLabel,
  demoNodePath,
  demoPatchNode,
  demoSchema,
  demoSchemas,
} from "./demo-model";

export function DemoLayoutInspector({
  layouts,
  selection,
  select,
  change,
  previewCount,
  setPreviewCount,
  drag,
  deleteContainer,
}: {
  layouts: DemoLayouts;
  selection: DemoSelection;
  select: (selection: DemoSelection) => void;
  change: (schemaId: string, root: DemoLayoutNode) => void;
  previewCount: number;
  setPreviewCount: (count: number) => void;
  drag: DemoDragRef;
  deleteContainer: () => void;
}) {
  const { schemaId, nodeId } = selection;
  const root = layouts[schemaId];
  if (!root) return null;
  const selected = demoFindNode(root, nodeId) ?? root;
  const path = demoNodePath(root, selected.id);
  const parent = path.at(-2);
  const siblings = parent && "children" in parent ? parent.children : [];
  const index = siblings.findIndex((node) => node.id === selected.id);
  const selectNode = (node: DemoLayoutNode) =>
    select({
      ...selection,
      nodeId: node.id,
      field: "field" in node ? node.field : undefined,
      itemId: undefined,
    });
  const patchStyle = (patch: Partial<DemoStyle>) => {
    const apply = (node: DemoLayoutNode): DemoLayoutNode => ({
      ...node,
      style: { ...node.style, ...patch },
      ...("children" in node && (patch.fontFamily || patch.fontSize || patch.weight || patch.align)
        ? { children: node.children.map(apply) }
        : {}),
    });
    change(schemaId, demoPatchNode(root, selected.id, apply));
  };
  const move = (direction: -1 | 1) => {
    const sibling = siblings[index + direction];
    if (sibling)
      change(
        schemaId,
        demoMoveNode(root, selected.id, sibling.id, direction < 0 ? "before" : "after"),
      );
  };
  const insert = (kind: "row" | "column") => {
    const node: DemoLayoutNode = {
      id: demoNewId(),
      kind,
      children: [],
      style: { ...demoBaseStyle },
    };
    const destination = "children" in selected ? selected : (parent ?? root);
    change(
      schemaId,
      demoPatchNode(root, destination.id, (item) =>
        "children" in item ? { ...item, children: [...item.children, node] } : item,
      ),
    );
    selectNode(node);
  };
  const containers: DemoLayoutNode[] = [];
  const gather = (node: DemoLayoutNode) => {
    if ("children" in node) {
      if (!demoFindNode(selected, node.id)) containers.push(node);
      node.children.forEach(gather);
    }
  };
  gather(root);
  const tree = (node: DemoLayoutNode, depth = 0): React.ReactNode => {
    return (
      <div key={node.id}>
        <button
          type="button"
          className={`demo-tree-item ${node.id === selected.id ? "demo-active" : ""}`}
          style={{ paddingLeft: 8 + depth * 12, touchAction: "none" }}
          data-demo-tree-parent={demoNodePath(root, node.id).at(-2)?.id}
          data-demo-layout-node={node.id}
          data-demo-layout-schema={schemaId}
          data-demo-layout-container={"children" in node}
          onPointerDown={(event) => {
            if (node.id === root.id) return;
            const source = event.currentTarget;
            const treeElement = source.closest(".demo-tree");
            if (!treeElement) return;
            demoStartDrag(event, drag, {
              sourceId: node.id,
              source,
              label: demoNodeLabel(node, schemaId),
              hint: "Drop between siblings · Use Move into to change containers",
              select: () => selectNode(node),
              targets: () =>
                [...treeElement.querySelectorAll<HTMLElement>("[data-demo-tree-parent]")]
                  .filter(
                    (element) => element.dataset.demoTreeParent === source.dataset.demoTreeParent,
                  )
                  .map((element) => ({
                    id: element.dataset.demoLayoutNode ?? "",
                    label: element.textContent ?? "block",
                    element,
                  })),
              drop: (to, position) => change(schemaId, demoMoveNode(root, node.id, to, position)),
            });
          }}
          onClick={() => selectNode(node)}
          onFocus={() => selectNode(node)}
          aria-pressed={node.id === selected.id}
          title="Select block. Drag to reorder among siblings."
        >
          {"children" in node ? (
            node.kind === "row" ? (
              <Columns2 size={13} />
            ) : (
              <Rows2 size={13} />
            )
          ) : (
            <GripVertical size={12} />
          )}
          <span>{demoNodeLabel(node, schemaId)}</span>
        </button>
        {"children" in node && node.children.map((child) => tree(child, depth + 1))}
      </div>
    );
  };
  return (
    <>
      <div className="demo-inspector-heading">
        <span className="demo-caption">LAYOUT DEFINITION</span>
        <label className="sr-only" htmlFor="demo-schema">
          Layout definition
        </label>
        <select
          id="demo-schema"
          value={schemaId}
          onChange={(event) => {
            const next = layouts[event.target.value];
            if (next)
              select({
                ...selection,
                schemaId: event.target.value,
                nodeId: next.id,
                field: undefined,
                itemId: undefined,
              });
          }}
        >
          {demoSchemas.map((schema) => (
            <option key={schema.id} value={schema.id}>
              {schema.name}
            </option>
          ))}
        </select>
        <h2>{demoSchema(schemaId).level === "entry" ? "Shared entry layout" : "Section layout"}</h2>
        <p className="demo-muted">
          {demoSchema(schemaId).level === "entry"
            ? "Every entry of this type uses this layout."
            : "Arrange fields without changing their meaning."}
        </p>
      </div>
      <label className="demo-control">
        Preview entries
        <select
          value={previewCount}
          onChange={(event) => setPreviewCount(Number(event.target.value))}
        >
          {[0, 1, 2, 3].map((count) => (
            <option key={count} value={count}>
              {count} {count === 1 ? "entry" : "entries"}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="demo-label">Structure</p>
        <section className="demo-tree" aria-label="Layout structure">
          {tree(root)}
        </section>
      </div>
      <nav className="demo-breadcrumbs" aria-label="Selected layout path">
        {path.map((node) => (
          <button type="button" key={node.id} onClick={() => selectNode(node)}>
            {demoNodeLabel(node, schemaId)}
          </button>
        ))}
      </nav>
      <div>
        <p className="demo-label">Insert container</p>
        <p className="demo-muted">
          Into {demoNodeLabel("children" in selected ? selected : (parent ?? root), schemaId)}
        </p>
        <div className="demo-button-row">
          <button type="button" onClick={() => insert("row")}>
            <Columns2 size={14} /> Row
          </button>
          <button type="button" onClick={() => insert("column")}>
            <Rows2 size={14} /> Column
          </button>
        </div>
      </div>
      <div className="demo-button-row">
        <button
          type="button"
          aria-label="Move selected field up"
          disabled={index <= 0}
          onClick={() => move(-1)}
        >
          <ArrowUp size={14} /> Up
        </button>
        <button
          type="button"
          aria-label="Move selected field down"
          disabled={index < 0 || index === siblings.length - 1}
          onClick={() => move(1)}
        >
          <ArrowDown size={14} /> Down
        </button>
      </div>
      {selected.id !== root.id && (
        <label className="demo-control">
          Move into
          <select
            value=""
            onChange={(event) => {
              if (event.target.value)
                change(schemaId, demoMoveNode(root, selected.id, event.target.value, "inside"));
            }}
          >
            <option value="">Choose a container…</option>
            {containers.map((node) => (
              <option key={node.id} value={node.id}>
                {demoNodePath(root, node.id)
                  .map((part) => demoNodeLabel(part, schemaId))
                  .join(" / ")}
              </option>
            ))}
          </select>
        </label>
      )}
      {"children" in selected && selected.id !== root.id && (
        <div>
          <button
            type="button"
            onClick={deleteContainer}
            title="Delete container (Backspace or Delete)"
          >
            <Trash2 size={14} /> Delete container
          </button>
          <p className="demo-muted">Fields are kept. Undo restores the container.</p>
        </div>
      )}
      <div className="demo-inspector-grid">
        <label className="demo-control">
          Font
          <select
            value={selected.style.fontFamily}
            onChange={(event) =>
              patchStyle({ fontFamily: event.target.value === "serif" ? "serif" : "sans" })
            }
          >
            <option value="sans">Instrument Sans</option>
            <option value="serif">Newsreader</option>
          </select>
        </label>
        <label className="demo-control">
          Size
          <input
            type="number"
            min={10}
            max={40}
            value={selected.style.fontSize}
            onChange={(event) =>
              patchStyle({ fontSize: Math.max(10, Math.min(40, Number(event.target.value))) })
            }
          />
        </label>
        <label className="demo-control">
          Weight
          <select
            value={selected.style.weight}
            onChange={(event) =>
              patchStyle({ weight: event.target.value === "bold" ? "bold" : "normal" })
            }
          >
            <option value="normal">Regular</option>
            <option value="bold">Semibold</option>
          </select>
        </label>
        <label className="demo-control">
          Align
          <select
            value={selected.style.align}
            onChange={(event) =>
              patchStyle({
                align:
                  event.target.value === "right"
                    ? "right"
                    : event.target.value === "center"
                      ? "center"
                      : "left",
              })
            }
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
        {(["gap", "padding", "grow"] as const).map((key) => (
          <label className="demo-control" key={key}>
            {key === "grow" ? "Width weight" : key === "gap" ? "Gap" : "Padding"}
            <input
              type="number"
              min={key === "grow" ? 1 : 0}
              max={key === "grow" ? 8 : 48}
              value={selected.style[key]}
              onChange={(event) =>
                patchStyle({
                  [key]: Math.max(
                    key === "grow" ? 1 : 0,
                    Math.min(key === "grow" ? 8 : 48, Number(event.target.value)),
                  ),
                })
              }
            />
          </label>
        ))}
      </div>
      <p className="demo-muted">
        <CornerDownRight size={13} /> Drag to reorder siblings. Use Move into to change containers.
        Required fields stay bound.
      </p>
    </>
  );
}
