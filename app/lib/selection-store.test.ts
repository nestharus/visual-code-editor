import { expect, test } from "@playwright/test";

import {
  makeSelectionItem,
  makeSelectionScope,
  type AnchorKind,
  type SelectionItem,
} from "./anchor";
import { createSelectionStore, type LineageEvent, type SelectionStore } from "./selection-store";

const describe = test.describe;
const it = test;

function item(
  id: string,
  kind: AnchorKind = "node",
  mode: SelectionItem["mode"] = "entity",
): SelectionItem {
  return makeSelectionItem(id, kind, mode);
}

function event(overrides: Partial<LineageEvent> = {}): LineageEvent {
  return {
    kind: "renamed",
    fromId: "A",
    toIds: ["B"],
    affectedKind: "node",
    ...overrides,
  };
}

function selectedIds(store: SelectionStore): readonly string[] {
  return store.selection().items.map((selectionItem) => selectionItem.id);
}

function lineageToIds(kind: LineageEvent["kind"]): readonly string[] {
  if (kind === "removed" || kind === "unmatched") {
    return [];
  }

  if (kind === "split") {
    return ["B", "C"];
  }

  return ["B"];
}

function captureWarnings(action: () => void): unknown[][] {
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];

  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    action();
  } finally {
    console.warn = originalWarn;
  }

  return warnings;
}

describe("SelectionStore contract", () => {
  it("starts with an empty selection scope and no frozen lineage event", () => {
    const store = createSelectionStore();

    expect(store.selection()).toEqual(makeSelectionScope([]));
    expect(store.frozen()).toBeNull();
  });

  it("applies add, remove, toggle, replace, and clear with SelectionScope semantics", () => {
    const store = createSelectionStore();
    const first = item("node-A", "node");
    const second = item("edge-B", "edge");
    const third = item("node-C", "node", "contents");

    store.add(first);
    store.add(second);
    store.add(first);
    expect(store.selection()).toEqual(makeSelectionScope([first, second]));

    store.remove({ id: first.id, mode: first.mode });
    expect(store.selection()).toEqual(makeSelectionScope([second]));

    store.toggle(second);
    expect(store.selection()).toEqual(makeSelectionScope([]));

    store.toggle(third);
    expect(store.selection()).toEqual(makeSelectionScope([third]));

    store.replace([first, third]);
    expect(store.selection()).toEqual(makeSelectionScope([first, third]));

    store.clear();
    expect(store.selection()).toEqual(makeSelectionScope([]));
  });

  it("updates primaryAnchor after every successful mutation", () => {
    const store = createSelectionStore();
    const node = item("node-A", "node");
    const edge = item("edge-A", "edge");
    const widget = item("widget-A", "widget", "contents");

    store.add(node);
    expect(store.selection().primaryAnchor).toBe("node");

    store.add(edge);
    expect(store.selection().primaryAnchor).toBe("edge");

    store.remove({ id: edge.id, mode: edge.mode });
    expect(store.selection().primaryAnchor).toBe("node");

    store.toggle(widget);
    expect(store.selection().primaryAnchor).toBe("widget");

    store.replace([edge, node]);
    expect(store.selection().primaryAnchor).toBe("node");

    store.clear();
    expect(store.selection().primaryAnchor).toBeNull();
  });

  it("accepts valid SelectionItems created by the anchor substrate", () => {
    const store = createSelectionStore();
    const validItems = [
      item("node-entity", "node", "entity"),
      item("node-contents", "node", "contents"),
      item("edge-entity", "edge", "entity"),
      item("widget-contents", "widget", "contents"),
    ];

    for (const validItem of validItems) {
      store.add(validItem);
    }

    expect(store.selection()).toEqual(makeSelectionScope(validItems));
  });

  it("rejects every mutation while frozen and emits warnings", () => {
    const store = createSelectionStore();
    const original = item("A", "node");
    const replacement = item("replacement", "widget", "contents");
    store.add(original);

    store.notifyLineageEvent(event({ kind: "renamed", fromId: "A", toIds: ["B"] }));
    const frozenSelection = store.selection();

    const warnings = captureWarnings(() => {
      store.add(item("extra", "edge"));
      store.remove({ id: original.id, mode: original.mode });
      store.toggle(original);
      store.replace([replacement]);
      store.clear();
    });

    expect(store.selection()).toEqual(frozenSelection);
    expect(store.frozen()).not.toBeNull();
    expect(warnings.length).toBeGreaterThanOrEqual(5);
  });

  it("filters lineage events so SAME and ADDED never freeze and other kinds freeze only for selected fromIds", () => {
    const store = createSelectionStore();
    store.add(item("A", "node"));

    store.notifyLineageEvent(event({ kind: "same", fromId: "A", toIds: ["A"] }));
    expect(store.frozen()).toBeNull();

    store.notifyLineageEvent(event({ kind: "added", fromId: "B", toIds: ["B"] }));
    expect(store.frozen()).toBeNull();

    for (const kind of ["renamed", "merged", "split", "removed", "unmatched"] as const) {
      store.notifyLineageEvent(
        event({ kind, fromId: "not-selected", toIds: lineageToIds(kind) }),
      );
      expect(store.frozen()).toBeNull();
    }

    store.notifyLineageEvent(event({ kind: "removed", fromId: "A", toIds: [] }));
    expect(store.frozen()).not.toBeNull();
  });

  it("stores the previous selection and precomputed proposed selection in frozen state", () => {
    const store = createSelectionStore();
    const original = item("A", "node");
    const lineageEvent = event({ kind: "split", fromId: "A", toIds: ["B", "C"] });
    const previousSelection = makeSelectionScope([original]);
    const proposedSelection = makeSelectionScope([item("B", "node"), item("C", "node")]);

    store.add(original);
    store.notifyLineageEvent(lineageEvent);

    expect(store.selection()).toEqual(previousSelection);
    expect(store.frozen()).toEqual({
      event: lineageEvent,
      previousSelection,
      proposedSelection,
    });
  });

  it("applies the RENAMED, MERGED, SPLIT, REMOVED, and UNMATCHED lineage matrix", () => {
    const cases = [
      {
        kind: "renamed",
        toIds: ["B"],
        expectedItems: [item("B", "node")],
      },
      {
        kind: "merged",
        toIds: ["B"],
        expectedItems: [item("B", "node")],
      },
      {
        kind: "split",
        toIds: ["B", "C"],
        expectedItems: [item("B", "node"), item("C", "node")],
      },
      {
        kind: "removed",
        toIds: [],
        expectedItems: [],
      },
      {
        kind: "unmatched",
        toIds: [],
        expectedItems: [],
      },
    ] as const satisfies readonly {
      kind: LineageEvent["kind"];
      toIds: readonly string[];
      expectedItems: readonly SelectionItem[];
    }[];

    for (const testCase of cases) {
      const store = createSelectionStore();
      store.add(item("A", "node"));

      store.notifyLineageEvent(
        event({ kind: testCase.kind, fromId: "A", toIds: testCase.toIds }),
      );
      store.applyLineage();

      expect(store.frozen(), `${testCase.kind} should clear frozen state`).toBeNull();
      expect(store.selection(), `${testCase.kind} should apply its transition`).toEqual(
        makeSelectionScope(testCase.expectedItems),
      );
    }
  });

  it("dismissLineage clears frozen state without changing selection", () => {
    const store = createSelectionStore();
    const original = item("A", "node");
    store.add(original);

    store.notifyLineageEvent(event({ kind: "renamed", fromId: "A", toIds: ["B"] }));
    expect(store.frozen()).not.toBeNull();

    store.dismissLineage();

    expect(store.frozen()).toBeNull();
    expect(store.selection()).toEqual(makeSelectionScope([original]));
  });

  it("preserves selection mode through lineage transitions", () => {
    const store = createSelectionStore();
    store.add(item("A", "node", "contents"));

    store.notifyLineageEvent(event({ kind: "split", fromId: "A", toIds: ["B", "C"] }));
    store.applyLineage();

    expect(store.selection()).toEqual(
      makeSelectionScope([item("B", "node", "contents"), item("C", "node", "contents")]),
    );
  });

  it("ignores a second lineage event while frozen and keeps the first event active", () => {
    const store = createSelectionStore();
    const first = event({ kind: "renamed", fromId: "A", toIds: ["B"] });
    const second = event({ kind: "split", fromId: "A", toIds: ["C", "D"] });
    store.add(item("A", "node"));

    store.notifyLineageEvent(first);
    const warnings = captureWarnings(() => {
      store.notifyLineageEvent(second);
    });

    expect(store.frozen()?.event).toEqual(first);
    expect(store.frozen()?.proposedSelection).toEqual(makeSelectionScope([item("B", "node")]));
    expect(warnings.length).toBeGreaterThanOrEqual(1);

    store.applyLineage();
    expect(selectedIds(store)).toEqual(["B"]);
  });
});
