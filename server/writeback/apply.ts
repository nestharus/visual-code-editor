import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { BehaviorDraft, ProposedSlice, WritebackPlan } from "./validate";
import { makeWritebackPlan } from "./validate";

export type ApplyWritebackResult = {
  plan: WritebackPlan;
  filesWritten: readonly string[];
};

type FileEdit = {
  filePath: string;
  absolutePath: string;
  originalText: string;
  nextText: string;
  slices: ProposedSlice[];
};

type SplitLines = {
  lines: string[];
  hasFinalNewline: boolean;
};

export async function buildWritebackPlan(
  draft: BehaviorDraft,
  workspaceRoot: string,
  validatedAtMs = Date.now(),
): Promise<WritebackPlan> {
  const edits = await readFileEdits(draft, workspaceRoot);
  const effectiveDiff = edits
    .map((edit) => buildUnifiedDiff(edit.filePath, edit.originalText, edit.nextText))
    .filter((diff) => diff.length > 0)
    .join("\n");

  return makeWritebackPlan({
    draft,
    effectiveDiff: effectiveDiff || buildNoopDiff(draft),
    appliesAgainstRevision: draft.parentRevision,
    validatedAtMs,
  });
}

export async function applyWritebackDraft(
  draft: BehaviorDraft,
  workspaceRoot: string,
): Promise<ApplyWritebackResult> {
  const validatedAtMs = Date.now();
  const edits = await readFileEdits(draft, workspaceRoot);
  const effectiveDiff = edits
    .map((edit) => buildUnifiedDiff(edit.filePath, edit.originalText, edit.nextText))
    .filter((diff) => diff.length > 0)
    .join("\n");

  const filesWritten: string[] = [];
  for (const edit of edits) {
    if (edit.nextText === edit.originalText) continue;
    await mkdir(dirname(edit.absolutePath), { recursive: true });
    await writeFile(edit.absolutePath, edit.nextText, "utf8");
    filesWritten.push(edit.filePath);
  }

  const plan = makeWritebackPlan({
    draft,
    effectiveDiff: effectiveDiff || buildNoopDiff(draft),
    appliesAgainstRevision: draft.parentRevision,
    validatedAtMs,
  });

  return { plan, filesWritten };
}

export async function assertSlicesFitCurrentFiles(
  draft: BehaviorDraft,
  workspaceRoot: string,
): Promise<void> {
  const byFile = groupSlicesByFile(draft.proposedSlices);
  for (const [filePath, slices] of byFile) {
    const absolutePath = resolveWorkspacePath(workspaceRoot, filePath);
    const text = await readFile(absolutePath, "utf8");
    const lineCount = splitLines(text).lines.length;
    for (const slice of slices) {
      if (slice.startLine > lineCount + 1) {
        throw new Error(
          `ProposedSlice startLine exceeds current line count for ${filePath}`,
        );
      }
      if (slice.endLine > lineCount + 1) {
        throw new Error(
          `ProposedSlice endLine exceeds current line count for ${filePath}`,
        );
      }
    }
  }
}

async function readFileEdits(
  draft: BehaviorDraft,
  workspaceRoot: string,
): Promise<FileEdit[]> {
  const edits: FileEdit[] = [];
  for (const [filePath, slices] of groupSlicesByFile(draft.proposedSlices)) {
    const absolutePath = resolveWorkspacePath(workspaceRoot, filePath);
    const originalText = await readFile(absolutePath, "utf8");
    const nextText = applySlicesToText(originalText, slices);
    edits.push({ filePath, absolutePath, originalText, nextText, slices });
  }
  return edits;
}

function applySlicesToText(text: string, slices: readonly ProposedSlice[]): string {
  const original = splitLines(text);
  const lines = [...original.lines];
  const sortedSlices = [...slices].sort((left, right) => right.startLine - left.startLine);

  for (const slice of sortedSlices) {
    const replacement = splitLines(slice.newText).lines;
    const startIndex = slice.startLine - 1;
    const deleteCount = Math.max(0, slice.endLine - slice.startLine + 1);
    lines.splice(startIndex, deleteCount, ...replacement);
  }

  const joined = lines.join("\n");
  return original.hasFinalNewline ? `${joined}\n` : joined;
}

function buildUnifiedDiff(filePath: string, before: string, after: string): string {
  if (before === after) return "";

  const beforeLines = splitLines(before).lines;
  const afterLines = splitLines(after).lines;
  const max = Math.max(beforeLines.length, afterLines.length);
  const body: string[] = [];

  for (let index = 0; index < max; index += 1) {
    const beforeLine = beforeLines[index];
    const afterLine = afterLines[index];
    if (beforeLine === afterLine) {
      if (beforeLine !== undefined) body.push(` ${beforeLine}`);
      continue;
    }
    if (beforeLine !== undefined) body.push(`-${beforeLine}`);
    if (afterLine !== undefined) body.push(`+${afterLine}`);
  }

  return [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
    ...body,
  ].join("\n");
}

function buildNoopDiff(draft: BehaviorDraft): string {
  const filePath = draft.proposedSlices[0]?.filePath ?? "unknown";
  return [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    "@@ -0,0 +0,0 @@",
    " no changes",
  ].join("\n");
}

function splitLines(text: string): SplitLines {
  if (text === "") {
    return { lines: [], hasFinalNewline: false };
  }

  const hasFinalNewline = text.endsWith("\n");
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (hasFinalNewline) {
    lines.pop();
  }
  return { lines, hasFinalNewline };
}

function groupSlicesByFile(
  slices: readonly ProposedSlice[],
): Map<string, ProposedSlice[]> {
  const byFile = new Map<string, ProposedSlice[]>();
  for (const slice of slices) {
    const existing = byFile.get(slice.filePath);
    if (existing) {
      existing.push(slice);
    } else {
      byFile.set(slice.filePath, [slice]);
    }
  }
  return byFile;
}

export function resolveWorkspacePath(workspaceRoot: string, filePath: string): string {
  const absoluteRoot = resolve(workspaceRoot);
  const absolutePath = resolve(absoluteRoot, filePath);
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error(`Path escapes workspace: ${filePath}`);
  }
  return absolutePath;
}
