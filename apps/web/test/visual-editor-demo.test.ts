/** DEMO ONLY: invariants for the isolated visual editor; no production persistence or AI. */

import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  demoBoxesIntersect,
  demoFormatSelection,
} from "../src/components/demo/visual-editor/demo-area-selection";
import {
  demoCanEditDocument,
  demoDocument,
  demoDocumentStructure,
  demoRecordsFromDocument,
} from "../src/components/demo/visual-editor/demo-document";
import { demoDropAtPoint } from "../src/components/demo/visual-editor/demo-drag";
import {
  demoEmptyRecord,
  demoInitialState,
  demoLibrary,
  demoPreviewSections,
} from "../src/components/demo/visual-editor/demo-fixtures";
import { demoHistoryShortcut } from "../src/components/demo/visual-editor/demo-history-shortcuts";
import {
  demoCloneRecord,
  demoFindNode,
  demoFindRecord,
  demoMapRecords,
  demoMoveListItem,
  demoMoveNode,
  demoMoveRecordRelative,
  demoMoveRelative,
  demoParseState,
  demoPatchNode,
  demoReadTarget,
  demoReorderRecord,
  demoUnwrapNode,
  demoWriteTarget,
} from "../src/components/demo/visual-editor/demo-model";
import { demoHistory, demoHistoryReducer } from "../src/components/demo/visual-editor/demo-state";
import {
  type DemoBrowserStorage,
  demoLoadStorage,
  demoResetStorage,
  demoSaveStorage,
  demoStorageKey,
} from "../src/components/demo/visual-editor/demo-storage";
import {
  demoApplySuggestion,
  demoReplacementSuggestion,
  demoSuggestions,
} from "../src/components/demo/visual-editor/demo-suggestions";

function demoFields(document: JSONContent): JSONContent[] {
  return document.type === "demoField" ? [document] : (document.content ?? []).flatMap(demoFields);
}
const demoTarget = {
  recordId: "demo-northstar",
  field: "accomplishments",
  itemId: "demo-northstar-accomplishments-0",
};

describe("visual editor demo", () => {
  it("moves and unwraps nested layouts without losing fixed schema bindings or content", () => {
    const state = demoInitialState();
    const root = state.layouts["education-entry"];
    if (!root) throw new Error("Missing fixture");
    const moved = demoMoveNode(
      root,
      "education-entry-degree",
      "education-entry-heading-row",
      "inside",
    );
    const unwrapped = demoUnwrapNode(moved, "education-entry-heading-row");
    const parsed = demoParseState({
      ...state,
      layouts: { ...state.layouts, "education-entry": unwrapped },
    });
    expect(parsed.sections).toEqual(state.sections);
    expect(demoFindNode(unwrapped, "education-entry-degree")).toBeDefined();
    expect(demoFindNode(unwrapped, "education-entry-heading-row")).toBeUndefined();
    expect(demoMoveNode(root, root.id, "education-entry-heading-row", "inside")).toBe(root);
    expect(
      demoMoveNode(root, "education-entry-heading-row", "education-entry-dates-row", "inside"),
    ).toBe(root);
    expect(demoMoveNode(root, "education-entry-degree", "missing", "inside")).toBe(root);
  });

  it("projects the same entry layout for every repeat count", () => {
    const state = demoInitialState();
    const root = state.layouts["education-entry"];
    if (!root) throw new Error("Missing fixture");
    state.layouts["education-entry"] = demoPatchNode(root, "education-entry-degree", (node) => ({
      ...node,
      style: { ...node.style, fontSize: 18 },
    }));
    for (const count of [0, 1, 3]) {
      const fields = demoFields(demoDocument(demoPreviewSections(count), state.layouts)).filter(
        (field) => field.attrs?.field === "degree",
      );
      expect(fields).toHaveLength(count);
      expect(fields.every((field) => field.attrs?.style.fontSize === 18)).toBe(true);
    }
    expect(demoFindRecord(state.sections, "demo-education")?.children.entries).toHaveLength(2);
  });

  it("maps inline text by record and list-item identity and rejects structural typing", () => {
    const state = demoInitialState();
    const document = demoDocument(state.sections, state.appliedLayouts);
    const before = demoDocumentStructure(document);
    const field = demoFields(document).find((node) => node.attrs?.itemId === demoTarget.itemId);
    if (!field) throw new Error("Missing fixture");
    field.content = [{ type: "text", text: "Edited one bullet." }];
    expect(demoDocumentStructure(document)).toBe(before);
    const next = demoRecordsFromDocument(document, state.sections);
    expect(demoReadTarget(next, demoTarget)).toBe("Edited one bullet.");
    expect(demoFindRecord(next, "demo-education")).toEqual(
      demoFindRecord(state.sections, "demo-education"),
    );
    expect(demoFindRecord(next, "demo-northstar")?.values.accomplishments).toHaveLength(2);
    document.content?.pop();
    expect(demoDocumentStructure(document)).not.toBe(before);
  });

  it("applies one scripted target in one undo step and refuses stale previews", () => {
    const state = demoInitialState();
    const suggestion = demoSuggestions(state.sections, demoTarget, "product")[0];
    if (!suggestion) throw new Error("Missing fixture");
    const history = demoHistoryReducer(demoHistory(state), {
      type: "commit",
      update: (current) => demoApplySuggestion(current, suggestion),
      time: 1,
    });
    expect(history.past).toHaveLength(1);
    expect(history.present.appliedLayouts).toEqual(state.appliedLayouts);
    expect(demoReadTarget(history.present.sections, demoTarget)).toBe(suggestion.after);
    expect(demoHistoryReducer(history, { type: "undo" }).present).toEqual(state);
    expect(() => demoApplySuggestion({ ...state, job: "implementation" }, suggestion)).toThrow(
      "changed",
    );
    expect(() =>
      demoApplySuggestion(
        {
          ...state,
          sections: demoWriteTarget(state.sections, demoTarget, "Changed after preview"),
        },
        suggestion,
      ),
    ).toThrow("changed");
    expect(
      demoSuggestions(state.sections, { recordId: "demo-contact", field: "name" }, "product"),
    ).toEqual([]);
  });

  it("replaces only the chosen entry, retains layouts, and restores original IDs on undo", () => {
    const state = demoInitialState();
    const candidate = demoReplacementSuggestion(
      state.sections,
      { recordId: "demo-northstar", field: "" },
      "implementation",
    );
    if (!candidate) throw new Error("Missing fixture");
    expect(candidate.replacement.values.employer).toBe("Wayfinder Labs");
    const replacement = { ...demoCloneRecord(candidate.replacement), id: "demo-northstar" };
    const history = demoHistoryReducer(demoHistory(state), {
      type: "commit",
      time: 1,
      update: (current) => ({
        ...current,
        sections: demoMapRecords(current.sections, "demo-northstar", () => replacement),
      }),
    });
    expect(history.present.appliedLayouts).toEqual(state.appliedLayouts);
    expect(demoFindRecord(history.present.sections, "demo-northstar")?.values.employer).toBe(
      "Wayfinder Labs",
    );
    expect(demoFindRecord(history.present.sections, "demo-education")).toEqual(
      demoFindRecord(state.sections, "demo-education"),
    );
    expect(demoHistoryReducer(history, { type: "undo" }).present).toEqual(state);
    expect(demoParseState(history.present)).toEqual(history.present);
  });

  it("reorders and removes individual entries, keeping siblings intact", () => {
    const state = demoInitialState();
    const moved = demoReorderRecord(state.sections, "demo-central", -1);
    expect(
      demoFindRecord(moved, "demo-education")?.children.entries?.map((record) => record.id),
    ).toEqual(["demo-central", "demo-lakeside"]);
    const removed = demoMapRecords(moved, "demo-central", () => null);
    expect(demoFindRecord(removed, "demo-education")?.children.entries).toHaveLength(1);
    expect(demoFindRecord(removed, "demo-lakeside")).toEqual(
      demoLibrary.find((record) => record.id === "demo-lakeside"),
    );
  });

  it("round trips both experiments and rejects incompatible or damaged persistence", () => {
    const state = demoInitialState();
    expect(demoParseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(() => demoParseState({ ...state, version: 2 })).toThrow();
    expect(() => demoParseState({ ...state, layouts: {} })).toThrow();
    const root = state.layouts["education-entry"];
    if (!root || !("children" in root)) throw new Error("Missing fixture");
    const missing = { ...root, children: root.children.slice(1) };
    expect(() =>
      demoParseState({ ...state, layouts: { ...state.layouts, "education-entry": missing } }),
    ).toThrow("schema changed");
    expect(() =>
      demoParseState({ ...state, sections: [...state.sections, state.sections[0]] }),
    ).toThrow();
  });

  it("coalesces typing, keeps explicit changes separate, and clears redo after another edit", () => {
    const state = demoInitialState();
    let history = demoHistory(state);
    for (const [time, text] of [
      [100, "a"],
      [200, "ab"],
    ] as const) {
      history = demoHistoryReducer(history, {
        type: "commit",
        time,
        group: "demo-field",
        update: (current) => ({
          ...current,
          sections: demoWriteTarget(current.sections, demoTarget, text),
        }),
      });
    }
    expect(history.past).toHaveLength(1);
    history = demoHistoryReducer(history, {
      type: "commit",
      time: 250,
      update: (current) => ({ ...current, previewCount: 3 }),
    });
    expect(history.past).toHaveLength(2);
    history = demoHistoryReducer(history, { type: "undo" });
    expect(history.future).toHaveLength(1);
    history = demoHistoryReducer(history, {
      type: "commit",
      time: 300,
      update: (current) => ({ ...current, job: "implementation" }),
    });
    expect(history.future).toHaveLength(0);
  });
});

describe("demo browser storage boundary", () => {
  it("reports unreadable data and resets only the current demo key", () => {
    const key = demoStorageKey("demo-owner");
    const values = new Map([
      ["unrelated-preference", "keep"],
      [key, "{broken"],
    ]);
    const storage: DemoBrowserStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    expect(demoLoadStorage(storage, key)).toEqual({ status: "invalid" });
    expect(values.get(key)).toBe("{broken");
    expect(demoResetStorage(storage, key)).toBe("saved");
    expect([...values]).toEqual([["unrelated-preference", "keep"]]);
    const state = demoInitialState();
    expect(demoSaveStorage(storage, key, state)).toBe("saved");
    expect(demoLoadStorage(storage, key)).toEqual({ status: "saved", state });
    expect(demoStorageKey("different-owner")).not.toBe(key);
  });
  it("reports unavailable storage without interrupting local state changes", () => {
    const fail = () => {
      throw new Error("Storage blocked");
    };
    const storage: DemoBrowserStorage = { getItem: fail, setItem: fail, removeItem: fail };
    const state = demoInitialState();
    expect(demoLoadStorage(storage, "demo")).toEqual({ status: "unavailable" });
    expect(demoSaveStorage(storage, "demo", state)).toBe("unavailable");
    expect(demoResetStorage(storage, "demo")).toBe("unavailable");
    expect(
      demoHistoryReducer(demoHistory(state), {
        type: "commit",
        time: 1,
        update: (current) => ({ ...current, previewCount: 3 }),
      }).present.previewCount,
    ).toBe(3);
  });
});

describe("demo scoped dragging", () => {
  it("moves whole sections and entries only within their own collection", () => {
    const state = demoInitialState();
    const moved = demoMoveRecordRelative(
      state.sections,
      "demo-education",
      "demo-summary",
      "before",
    );
    expect(moved.map((record) => record.id)).toEqual([
      "demo-contact",
      "demo-education",
      "demo-summary",
      "demo-experience",
      "demo-skills",
    ]);
    expect(demoFindRecord(moved, "demo-education")).toEqual(
      demoFindRecord(state.sections, "demo-education"),
    );
    const entries = demoMoveRecordRelative(
      state.sections,
      "demo-lakeside",
      "demo-central",
      "after",
    );
    expect(
      demoFindRecord(entries, "demo-education")?.children.entries?.map((record) => record.id),
    ).toEqual(["demo-central", "demo-lakeside"]);
    expect(
      demoMoveRecordRelative(state.sections, "demo-lakeside", "demo-northstar", "before"),
    ).toEqual(state.sections);
  });
  it("keeps existing stored experiments and captures template section order separately", () => {
    const { templateSectionOrder, appliedSectionOrder, ...legacy } = demoInitialState();
    const restored = demoParseState(legacy);
    expect(restored.templateSectionOrder).toEqual(templateSectionOrder);
    expect(restored.appliedSectionOrder).toEqual(appliedSectionOrder);
    const reordered = demoMoveRelative(
      templateSectionOrder,
      "education-section",
      "summary-section",
      "before",
    );
    const state = demoParseState({ ...restored, templateSectionOrder: reordered });
    expect(state.sections).toEqual(legacy.sections);
    expect(state.appliedSectionOrder).toEqual(appliedSectionOrder);
    expect(demoPreviewSections(2, reordered).map((record) => record.schema.id)).toEqual(reordered);
    expect(() =>
      demoParseState({ ...state, templateSectionOrder: ["education-section"] }),
    ).toThrow();
  });
  it("shows exact sibling insertion edges and rejects out-of-scope drops", () => {
    const targets = [
      { id: "a", left: 100, right: 400, top: 100, bottom: 200 },
      { id: "b", left: 100, right: 400, top: 220, bottom: 320 },
    ];
    expect(demoDropAtPoint("a", targets, { x: 150, y: 230 })).toMatchObject({
      id: "b",
      position: "before",
      top: 210,
      height: 3,
    });
    expect(demoDropAtPoint("a", targets, { x: 150, y: 310 })).toMatchObject({
      id: "b",
      position: "after",
      top: 326,
    });
    expect(demoDropAtPoint("a", targets, { x: 150, y: 140 })).toBeNull();
    expect(demoDropAtPoint("a", targets, { x: 150, y: 380 })).toBeNull();
    expect(demoDropAtPoint("a", targets, { x: 50, y: 250 })).toBeNull();
    expect(
      demoDropAtPoint(
        "a",
        [
          { id: "a", left: 100, right: 400, top: 100, bottom: 200 },
          { id: "b", left: 420, right: 500, top: 100, bottom: 200 },
        ],
        { x: 490, y: 150 },
        true,
      ),
    ).toMatchObject({ position: "after", width: 3 });
  });
});

describe("demo area selection", () => {
  it("selects intersecting visible fields and excludes empty or merely adjacent bounds", () => {
    const box = { left: 50, right: 200, top: 100, bottom: 200 };
    expect(demoBoxesIntersect(box, { left: 190, right: 300, top: 110, bottom: 130 })).toBe(true);
    expect(demoBoxesIntersect(box, { left: 200, right: 300, top: 110, bottom: 130 })).toBe(false);
    expect(demoBoxesIntersect(box, { left: 60, right: 160, top: 130, bottom: 130 })).toBe(false);
  });
  it("formats selected shared fields across samples in one undo step without changing values", () => {
    const state = demoInitialState();
    const selection = ["demo-lakeside", "demo-central"].map((recordId) => ({
      recordId,
      schemaId: "education-entry",
      nodeId: "education-entry-degree",
      field: "degree",
    }));
    const history = demoHistoryReducer(demoHistory(state), {
      type: "commit",
      time: 1,
      update: (current) => ({
        ...current,
        layouts: demoFormatSelection(current.layouts, selection, {
          weight: "bold",
          align: "center",
        }),
      }),
    });
    expect(history.past).toHaveLength(1);
    const fields = demoFields(demoDocument(demoPreviewSections(2), history.present.layouts)).filter(
      (field) => field.attrs?.field === "degree",
    );
    expect(fields).toHaveLength(2);
    expect(
      fields.every(
        (field) => field.attrs?.style.weight === "bold" && field.attrs?.style.align === "center",
      ),
    ).toBe(true);
    expect(history.present.sections).toEqual(state.sections);
    expect(history.present.appliedLayouts).toEqual(state.appliedLayouts);
    expect(demoParseState(history.present)).toEqual(history.present);
    expect(demoHistoryReducer(history, { type: "undo" }).present).toEqual(state);
  });
});

describe("demo history shortcuts", () => {
  const key = {
    key: "z",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    defaultPrevented: false,
  };
  it.each(["metaKey", "ctrlKey"] as const)(
    "supports undo and shifted uppercase redo with %s",
    (modifier) => {
      expect(demoHistoryShortcut({ ...key, [modifier]: true })).toBe("undo");
      expect(demoHistoryShortcut({ ...key, [modifier]: true, shiftKey: true, key: "Z" })).toBe(
        "redo",
      );
      expect(demoHistoryShortcut({ ...key, [modifier]: true, key: "y" })).toBe("redo");
    },
  );
  it("ignores ordinary typing, composition, Alt chords, and handled events", () => {
    expect(demoHistoryShortcut(key)).toBeNull();
    for (const flag of ["isComposing", "altKey", "defaultPrevented"] as const) {
      expect(demoHistoryShortcut({ ...key, ctrlKey: true, [flag]: true })).toBeNull();
    }
    expect(demoHistoryShortcut({ ...key, metaKey: true, key: "a" })).toBeNull();
  });
});

describe("demo blank entries", () => {
  it.each(["experience-entry", "education-entry", "contact-link"])(
    "creates an empty %s with editable placeholders, not example content",
    (schemaId) => {
      const state = demoInitialState();
      const record = demoEmptyRecord(schemaId);
      expect(
        Object.values(record.values).every((value) =>
          typeof value === "string" ? value === "" : value.every((item) => item.text === ""),
        ),
      ).toBe(true);
      expect(Object.values(record.children).every((records) => records.length === 0)).toBe(true);
      const fields = demoFields(demoDocument([record], state.layouts));
      expect(fields.length).toBeGreaterThan(0);
      expect(fields.every((field) => field.content?.length === 0 && field.attrs?.label)).toBe(true);
      expect(demoRecordsFromDocument(demoDocument([record], state.layouts), [record])).toEqual([
        record,
      ]);
      expect(demoEmptyRecord(schemaId).id).not.toBe(record.id);
    },
  );
  it("adds an empty entry to the requested section and restores it with redo", () => {
    const state = demoInitialState();
    const record = demoEmptyRecord("education-entry");
    const history = demoHistoryReducer(demoHistory(state), {
      type: "commit",
      time: 1,
      update: (current) => ({
        ...current,
        sections: demoMapRecords(current.sections, "demo-education", (parent) => ({
          ...parent,
          children: { ...parent.children, entries: [...(parent.children.entries ?? []), record] },
        })),
      }),
    });
    expect(demoParseState(history.present)).toEqual(history.present);
    expect(
      demoFindRecord(history.present.sections, "demo-education")?.children.entries,
    ).toHaveLength(3);
    expect(demoFindRecord(history.present.sections, "demo-experience")).toEqual(
      demoFindRecord(state.sections, "demo-experience"),
    );
    expect(history.present.appliedLayouts).toEqual(state.appliedLayouts);
    const undone = demoHistoryReducer(history, { type: "undo" });
    expect(undone.present).toEqual(state);
    expect(demoHistoryReducer(undone, { type: "redo" }).present).toEqual(history.present);
  });
});

describe("demo list reordering", () => {
  it("moves one sibling item without changing text, identities, layout, or other records", () => {
    const state = demoInitialState();
    const before = demoFindRecord(state.sections, demoTarget.recordId)?.values.accomplishments;
    if (!Array.isArray(before) || !before[1]) throw new Error("Missing list fixture");
    const history = demoHistoryReducer(demoHistory(state), {
      type: "commit",
      time: 1,
      update: (current) => ({
        ...current,
        sections: demoMoveListItem(current.sections, demoTarget, before[1]?.id ?? "", "after"),
      }),
    });
    expect(
      demoFindRecord(history.present.sections, demoTarget.recordId)?.values.accomplishments,
    ).toEqual([...before].reverse());
    expect(demoFindRecord(history.present.sections, "demo-education")).toEqual(
      demoFindRecord(state.sections, "demo-education"),
    );
    expect(history.present.appliedLayouts).toEqual(state.appliedLayouts);
    expect(demoParseState(history.present)).toEqual(history.present);
    expect(demoHistoryReducer(history, { type: "undo" }).present).toEqual(state);
    expect(demoMoveListItem(state.sections, demoTarget, "demo-skills-skills-0", "before")).toBe(
      state.sections,
    );
    expect(
      demoMoveListItem(state.sections, { ...demoTarget, field: "title" }, before[1].id, "before"),
    ).toBe(state.sections);
  });
});

describe("demo explicit field editing", () => {
  it("rejects typing until a field is opened, then permits only that field", () => {
    const state = demoInitialState();
    const before = demoDocument(state.sections, state.appliedLayouts);
    const changed = structuredClone(before);
    const field = demoFields(changed).find((node) => node.attrs?.itemId === demoTarget.itemId);
    if (!field) throw new Error("Missing field");
    field.content = [{ type: "text", text: "Deliberate edit" }];
    expect(demoCanEditDocument(before, changed, null)).toBe(false);
    expect(demoCanEditDocument(before, changed, demoTarget)).toBe(true);
    expect(
      demoCanEditDocument(before, changed, {
        ...demoTarget,
        itemId: "demo-northstar-accomplishments-1",
      }),
    ).toBe(false);
    expect(
      demoCanEditDocument(before, changed, { ...demoTarget, recordId: "another-record" }),
    ).toBe(false);
    const sibling = demoFields(changed).find(
      (node) => node.attrs?.itemId === "demo-northstar-accomplishments-1",
    );
    if (!sibling) throw new Error("Missing sibling");
    sibling.content = [{ type: "text", text: "Unintended edit" }];
    expect(demoCanEditDocument(before, changed, demoTarget)).toBe(false);
  });
  it("keeps structural changes locked even while editing", () => {
    const state = demoInitialState();
    const before = demoDocument(state.sections, state.appliedLayouts);
    const changed = structuredClone(before);
    changed.content?.pop();
    expect(demoCanEditDocument(before, changed, demoTarget)).toBe(false);
  });
});
