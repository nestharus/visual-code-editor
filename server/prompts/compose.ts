import type { AnchorKind, SelectionMode } from "../anchor-vocab";

export type ComposerMode = "ask" | "edit" | "direct";

export type ComposerSelectionItem = {
  id: string;
  kind: AnchorKind;
  mode: SelectionMode;
};

export type ComposerSelection = {
  items: ComposerSelectionItem[];
  primaryAnchor: AnchorKind | null;
};

export type ComposePromptInput = {
  mode: ComposerMode;
  surfaceAnchor: AnchorKind;
  selection: ComposerSelection;
  prompt: string;
  workspace?: unknown;
};

type EntityContext = {
  id: string;
  kind: AnchorKind;
  mode: SelectionMode;
  detail: unknown | null;
  elements: unknown[];
};

export function composePrompt(input: ComposePromptInput): string {
  const entities = input.selection.items.map((item) => ({
    id: item.id,
    kind: item.kind,
    mode: item.mode,
    detail: lookupDetail(input.workspace, item.id),
    elements: lookupElements(input.workspace, item.id),
  } satisfies EntityContext));

  const modeInstructions = modeHeader(input.mode);

  return [
    `# Prompt Composer (${input.mode})`,
    "",
    "## Anchor Context",
    `surfaceAnchor: ${input.surfaceAnchor}`,
    `primaryAnchor: ${input.selection.primaryAnchor ?? "null"}`,
    `selectionCount: ${input.selection.items.length}`,
    "",
    "## Mode",
    modeInstructions,
    "",
    "## Workspace Context",
    JSON.stringify({ entities }, null, 2),
    "",
    "## User Prompt",
    input.prompt.trim(),
  ].join("\n");
}

function modeHeader(mode: ComposerMode): string {
  switch (mode) {
    case "ask":
      return "Answer the user's question using the selected workspace context.";
    case "edit":
      return "Propose a concrete edit. If you return structured data, use a JSON object with a patch field.";
    case "direct":
      return "Carry out the user's instruction synchronously and report the result.";
  }
}

function lookupDetail(workspace: unknown, id: string): unknown | null {
  if (!workspace || typeof workspace !== "object") return null;
  const details = (workspace as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;
  return (details as Record<string, unknown>)[id] ?? null;
}

function lookupElements(workspace: unknown, id: string): unknown[] {
  const matches: unknown[] = [];
  visit(workspace, (value) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const data = record.data;
    if (record.id === id || (data && typeof data === "object" && (data as Record<string, unknown>).id === id)) {
      matches.push(value);
    }
  });
  return matches.slice(0, 20);
}

function visit(value: unknown, visitor: (value: unknown) => void, seen = new Set<unknown>()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  visitor(value);

  if (Array.isArray(value)) {
    for (const item of value) visit(item, visitor, seen);
    return;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    visit(child, visitor, seen);
  }
}
