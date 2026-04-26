import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { Task } from "../tasks/types";
import { getFileAtRevision } from "./git_show";
import {
  makeEntityDelta,
  makePRDeltaSet,
  type ComputePRDeltaRequest,
  type DeltaKind,
  type EntityDelta,
  type PRDeltaSet,
} from "./types";

const execFileAsync = promisify(execFile);

export type PRDeltaErrorKind = "validation" | "git" | "extraction" | "internal";

export class PRDeltaComputeError extends Error {
  readonly errorKind: PRDeltaErrorKind;

  constructor(errorKind: PRDeltaErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PRDeltaComputeError";
    this.errorKind = errorKind;
  }
}

export type TaskLookup = {
  get(id: string): Task | null;
};

export type ComputePRDeltaResult = {
  deltaSet: PRDeltaSet;
  variant: "revisions" | "task";
  baseRevision: string;
  headRevision: string;
  taskId?: string;
  prNumber?: number | null;
  changedFileCount: number;
  deltaCountTotal: number;
};

type ResolvedRequest = {
  variant: "revisions" | "task";
  baseRevision: string;
  headRevision: string;
  baseBranch: string;
  headBranch: string;
  prNumber: number | null;
  taskId: string | null;
  headWorkspaceRoot: string;
};

type ExtractedBehavior = {
  id: string;
  source_slices: readonly {
    file_path: string;
    start_line: number;
    end_line: number;
    start_col: number | null;
    end_col: number | null;
    slice_role: string;
  }[];
};

const GROUNDED_LSP_TRUST = {
  state: "grounded",
  grounding: "lsp-type",
} as const;

export async function computePRDeltaSet(options: {
  request: ComputePRDeltaRequest;
  workspaceRoot: string;
  taskLookup: TaskLookup;
}): Promise<ComputePRDeltaResult> {
  const totalTimeoutMs = envTimeout("PR_DELTA_TOTAL_TIMEOUT_MS", 60_000);
  const perFileTimeoutMs = envTimeout("PR_DELTA_PER_FILE_TIMEOUT_MS", 10_000);
  const deadlineMs = Date.now() + totalTimeoutMs;

  const resolved = await resolveRequest(options);
  const changedFiles = await listChangedFiles(
    options.workspaceRoot,
    resolved.baseRevision,
    resolved.headRevision,
  );
  const pythonFiles = changedFiles.filter((filePath) => filePath.endsWith(".py"));
  const deltas: EntityDelta[] = [];

  for (const filePath of pythonFiles) {
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) {
      throw new PRDeltaComputeError("extraction", "PR delta computation timed out");
    }

    const timeoutMs = Math.min(perFileTimeoutMs, remainingMs);
    const baseContent = await getFileAtRevision(
      options.workspaceRoot,
      resolved.baseRevision,
      filePath,
    );
    const headContent = await readHeadContent(resolved.headWorkspaceRoot, filePath);

    const [baseBehaviors, headBehaviors] = await Promise.all([
      extractBehaviorsFromContent(options.workspaceRoot, filePath, baseContent, timeoutMs),
      extractBehaviorsFromContent(options.workspaceRoot, filePath, headContent, timeoutMs),
    ]);

    deltas.push(...diffBehaviors(baseBehaviors, headBehaviors));
  }

  deltas.sort((left, right) => deltaSortKey(left).localeCompare(deltaSortKey(right)));
  const computedAtMs = await commitTimestampMs(options.workspaceRoot, resolved.headRevision);
  const deltaSet = makePRDeltaSet({
    id: buildDeltaSetId(resolved, computedAtMs),
    baseRevision: resolved.baseRevision,
    headRevision: resolved.headRevision,
    baseBranch: resolved.baseBranch,
    headBranch: resolved.headBranch,
    prNumber: resolved.prNumber,
    taskId: resolved.taskId,
    deltas,
    computedAtMs,
    attributionActor: "generator",
  });

  return {
    deltaSet,
    variant: resolved.variant,
    baseRevision: resolved.baseRevision,
    headRevision: resolved.headRevision,
    ...(resolved.taskId ? { taskId: resolved.taskId } : {}),
    prNumber: resolved.prNumber,
    changedFileCount: changedFiles.length,
    deltaCountTotal: deltas.length,
  };
}

async function resolveRequest(options: {
  request: ComputePRDeltaRequest;
  workspaceRoot: string;
  taskLookup: TaskLookup;
}): Promise<ResolvedRequest> {
  if (options.request.variant === "revisions") {
    return {
      variant: "revisions",
      baseRevision: options.request.baseRevision,
      headRevision: options.request.headRevision,
      baseBranch: options.request.baseBranch,
      headBranch: options.request.headBranch,
      prNumber: options.request.prNumber,
      taskId: null,
      headWorkspaceRoot: options.workspaceRoot,
    };
  }

  const task = options.taskLookup.get(options.request.taskId);
  if (!task) {
    throw new PRDeltaComputeError(
      "validation",
      `unknown task_id: ${options.request.taskId}`,
    );
  }

  const headRevision =
    task.worktree.headRevision ??
    (await revParse(options.workspaceRoot, task.worktree.branch));

  return {
    variant: "task",
    baseRevision: task.worktree.baseRevision,
    headRevision,
    baseBranch: task.worktree.baseBranch,
    headBranch: task.worktree.branch,
    prNumber: null,
    taskId: task.id,
    headWorkspaceRoot: task.worktree.path,
  };
}

async function listChangedFiles(
  workspaceRoot: string,
  baseRevision: string,
  headRevision: string,
): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", workspaceRoot, "diff", "--name-only", "-z", `${baseRevision}..${headRevision}`],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    return stdout.split("\0").filter(Boolean).sort();
  } catch (error) {
    throw new PRDeltaComputeError(
      "git",
      errorMessage(error, "failed to list changed files"),
      { cause: error },
    );
  }
}

async function revParse(workspaceRoot: string, revision: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", workspaceRoot, "rev-parse", revision],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    return stdout.trim();
  } catch (error) {
    throw new PRDeltaComputeError(
      "git",
      errorMessage(error, `failed to resolve revision ${revision}`),
      { cause: error },
    );
  }
}

async function commitTimestampMs(workspaceRoot: string, revision: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", workspaceRoot, "show", "-s", "--format=%ct", revision],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    return Number.parseInt(stdout.trim(), 10) * 1000;
  } catch (error) {
    throw new PRDeltaComputeError(
      "git",
      errorMessage(error, `failed to read commit timestamp for ${revision}`),
      { cause: error },
    );
  }
}

async function readHeadContent(
  workspaceRoot: string,
  filePath: string,
): Promise<string | null> {
  try {
    return await readFile(resolveWorkspacePath(workspaceRoot, filePath), "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw new PRDeltaComputeError(
      "internal",
      errorMessage(error, `failed to read ${filePath}`),
      { cause: error },
    );
  }
}

function extractBehaviorsFromContent(
  workspaceRoot: string,
  filePath: string,
  content: string | null,
  timeoutMs: number,
): Promise<ExtractedBehavior[]> {
  if (content === null) return Promise.resolve([]);

  return new Promise((resolveExtract, reject) => {
    const child = spawn(
      process.env.PYTHON ?? "python3",
      ["-m", "src.visual_code_editor.extractor_cli"],
      {
        cwd: workspaceRoot,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => {
        reject(
          new PRDeltaComputeError(
            "extraction",
            `behavior extraction timed out for ${filePath}`,
          ),
        );
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      finish(() => {
        reject(
          new PRDeltaComputeError(
            "extraction",
            errorMessage(error, "failed to start behavior extractor"),
            { cause: error },
          ),
        );
      });
    });
    child.on("exit", (code) => {
      finish(() => {
        const stdout = Buffer.concat(stdoutChunks).toString("utf8");
        const stderr = Buffer.concat(stderrChunks).toString("utf8");
        if (code !== 0) {
          reject(
            new PRDeltaComputeError(
              "extraction",
              stderr.trim() || `behavior extractor exited with code ${code}`,
            ),
          );
          return;
        }

        try {
          resolveExtract(JSON.parse(stdout) as ExtractedBehavior[]);
        } catch (error) {
          reject(
            new PRDeltaComputeError(
              "extraction",
              `behavior extractor returned invalid JSON for ${filePath}`,
              { cause: error },
            ),
          );
        }
      });
    });

    child.stdin.end(JSON.stringify({ file_path: filePath, content }));
  });
}

function diffBehaviors(
  baseBehaviors: readonly ExtractedBehavior[],
  headBehaviors: readonly ExtractedBehavior[],
): EntityDelta[] {
  const baseById = new Map(baseBehaviors.map((behavior) => [behavior.id, behavior]));
  const seenBaseIds = new Set<string>();
  const deltas: EntityDelta[] = [];

  for (const headBehavior of headBehaviors) {
    const baseBehavior = baseById.get(headBehavior.id);
    if (!baseBehavior) {
      deltas.push(behaviorDelta("added", null, headBehavior.id));
      continue;
    }

    seenBaseIds.add(headBehavior.id);
    const deltaKind: DeltaKind =
      slicesKey(baseBehavior) === slicesKey(headBehavior) ? "unchanged" : "reshaped";
    deltas.push(behaviorDelta(deltaKind, baseBehavior.id, headBehavior.id));
  }

  for (const baseBehavior of baseBehaviors) {
    if (!seenBaseIds.has(baseBehavior.id)) {
      deltas.push(behaviorDelta("removed", baseBehavior.id, null));
    }
  }

  return deltas;
}

function behaviorDelta(
  deltaKind: DeltaKind,
  baseId: string | null,
  headId: string | null,
): EntityDelta {
  return makeEntityDelta({
    deltaKind,
    entityKind: "behavior",
    baseId,
    headId,
    relatedIds: [],
    trust: GROUNDED_LSP_TRUST,
    attributionActor: "generator",
  });
}

function slicesKey(behavior: ExtractedBehavior): string {
  return JSON.stringify(
    behavior.source_slices.map((slice) => ({
      file_path: slice.file_path,
      start_line: slice.start_line,
      end_line: slice.end_line,
      start_col: slice.start_col,
      end_col: slice.end_col,
      slice_role: slice.slice_role,
    })),
  );
}

function deltaSortKey(delta: EntityDelta): string {
  return `${delta.entityKind}:${delta.headId ?? delta.baseId ?? ""}`;
}

function buildDeltaSetId(resolved: ResolvedRequest, computedAtMs: number): string {
  const source = resolved.taskId ?? String(resolved.prNumber ?? "0");
  return `prdelta:${sanitizeIdSegment(source)}:${sanitizeIdSegment(resolved.headRevision)}:${computedAtMs}`;
}

function sanitizeIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]+/g, "-") || "unknown";
}

function resolveWorkspacePath(workspaceRoot: string, filePath: string): string {
  const absoluteRoot = resolve(workspaceRoot);
  const absolutePath = resolve(absoluteRoot, filePath);
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error(`Path escapes workspace: ${filePath}`);
  }
  return absolutePath;
}

function envTimeout(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    if (typeof stderr === "string" && stderr.trim()) return stderr.trim();
  }
  return fallback;
}
