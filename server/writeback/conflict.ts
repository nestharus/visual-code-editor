import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { BehaviorDraft, ConflictKind, ConflictState, ProposedSlice } from "./validate";
import { makeConflictState } from "./validate";
import { resolveWorkspacePath } from "./apply";

type ConflictInput = {
  draft: BehaviorDraft;
  workspaceRoot: string;
  observedRevision: string;
};

type SplitLines = {
  lines: string[];
};

export async function detectWritebackConflict({
  draft,
  workspaceRoot,
  observedRevision,
}: ConflictInput): Promise<ConflictState> {
  const conflictingFiles = [];

  for (const [filePath, slices] of groupSlicesByFile(draft.proposedSlices)) {
    const absolutePath = resolveWorkspacePath(workspaceRoot, filePath);
    if (!existsSync(absolutePath)) {
      conflictingFiles.push({
        filePath,
        conflictKind: "file-deleted" as const,
        sourceUnchanged: false,
      });
      continue;
    }

    const movedPath = detectMovedPath(workspaceRoot, draft.parentRevision, observedRevision, filePath);
    if (movedPath) {
      conflictingFiles.push({
        filePath,
        conflictKind: "file-moved" as const,
        sourceUnchanged: false,
      });
      continue;
    }

    const currentText = await readFile(absolutePath, "utf8");
    const expectedText = readFileAtRevision(workspaceRoot, draft.parentRevision, filePath);
    const conflictKind = classifyChangedLines(currentText, expectedText, slices);

    conflictingFiles.push({
      filePath,
      conflictKind,
      sourceUnchanged: conflictKind === "whitespace-only",
    });
  }

  return makeConflictState({
    draftId: draft.id,
    conflictingFiles,
    observedRevision,
    expectedRevision: draft.parentRevision,
  });
}

function classifyChangedLines(
  currentText: string,
  expectedText: string | null,
  slices: readonly ProposedSlice[],
): ConflictKind {
  const currentLines = splitLines(currentText).lines;
  const expectedLines = expectedText ? splitLines(expectedText).lines : null;
  let sawOnlyWhitespace = true;

  for (const slice of slices) {
    const currentTarget = currentLines.slice(slice.startLine - 1, slice.endLine);
    if (!expectedLines) {
      if (looksWhitespaceOnlyChanged(currentTarget)) continue;
      return "lines-changed";
    }

    const expectedTarget = expectedLines.slice(slice.startLine - 1, slice.endLine);
    if (currentTarget.join("\n") === expectedTarget.join("\n")) continue;
    if (normalizeWhitespace(currentTarget.join("\n")) === normalizeWhitespace(expectedTarget.join("\n"))) {
      continue;
    }
    sawOnlyWhitespace = false;
  }

  return sawOnlyWhitespace ? "whitespace-only" : "lines-changed";
}

function looksWhitespaceOnlyChanged(lines: readonly string[]): boolean {
  const text = lines.join("\n");
  return /\s{2,}/.test(text) || /^\s|\s$/.test(text);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitLines(text: string): SplitLines {
  if (text === "") {
    return { lines: [] };
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (text.endsWith("\n")) {
    lines.pop();
  }
  return { lines };
}

function readFileAtRevision(
  workspaceRoot: string,
  revision: string,
  filePath: string,
): string | null {
  try {
    return execSync("git show " + shellQuote(`${revision}:${filePath}`), {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function detectMovedPath(
  workspaceRoot: string,
  expectedRevision: string,
  observedRevision: string,
  filePath: string,
): string | null {
  try {
    const output = execSync(
      `git diff --name-status --diff-filter=R ${shellQuote(expectedRevision)} ${shellQuote(observedRevision)} --`,
      {
        cwd: workspaceRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    for (const line of output.split(/\r?\n/)) {
      const [, oldPath, newPath] = line.split(/\t/);
      if (oldPath === filePath) {
        return newPath ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
