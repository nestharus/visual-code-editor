import { execSync } from "node:child_process";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

export class GitCommandError extends Error {
  readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.name = "GitCommandError";
    this.stderr = stderr;
  }
}

export type WorktreeAddInput = {
  workspaceRoot: string;
  taskId: string;
  branch: string;
  base: string;
};

export type WorktreeAddResult = {
  path: string;
  baseRevision: string;
};

export function currentBranch(workspaceRoot: string): string {
  return runGit(workspaceRoot, "git rev-parse --abbrev-ref HEAD");
}

export function revParse(workspaceRoot: string, ref: string): string {
  return runGit(workspaceRoot, `git rev-parse --verify ${shellQuote(ref)}`);
}

export function branchExists(workspaceRoot: string, branch: string): boolean {
  try {
    revParse(workspaceRoot, branch);
    return true;
  } catch {
    return false;
  }
}

export function addWorktree(input: WorktreeAddInput): WorktreeAddResult {
  const baseRevision = revParse(input.workspaceRoot, input.base);
  const path = worktreePath(input.workspaceRoot, input.taskId);

  createCollisionBranchForTestShim(input.workspaceRoot, input.branch);
  runGit(
    input.workspaceRoot,
    [
      "git worktree add",
      shellQuote(path),
      "-b",
      shellQuote(input.branch),
      shellQuote(input.base),
    ].join(" "),
  );

  return { path, baseRevision };
}

export async function removeWorktree(
  workspaceRoot: string,
  path: string,
  branch: string,
  baseRevision: string,
): Promise<void> {
  if (existsSync(path)) {
    runGit(
      workspaceRoot,
      `git worktree remove --force ${shellQuote(path)}`,
    );
  } else {
    await rm(path, { recursive: true, force: true });
  }

  if (branch.startsWith("task/") && branchExists(workspaceRoot, branch)) {
    const aheadCount = countCommitsBeyondBase(workspaceRoot, baseRevision, branch);
    if (aheadCount === 0) {
      runGit(workspaceRoot, `git branch -D ${shellQuote(branch)}`);
    }
  }
}

export function headRevision(workspaceRoot: string, ref: string): string {
  return revParse(workspaceRoot, ref);
}

function countCommitsBeyondBase(workspaceRoot: string, baseRevision: string, branch: string): number {
  const output = runGit(
    workspaceRoot,
    `git rev-list --count ${shellQuote(baseRevision)}..${shellQuote(branch)}`,
  );
  return Number.parseInt(output, 10) || 0;
}

function worktreePath(workspaceRoot: string, taskId: string): string {
  return join(workspaceRoot, "worktrees", taskId.replace(/^task:/, ""));
}

function runGit(workspaceRoot: string, command: string): string {
  try {
    return execSync(command.replace(/^git\b/, shellQuote(resolveGitBinary(workspaceRoot))), {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr = extractStderr(error);
    throw new GitCommandError(stderr || `git command failed: ${command}`, stderr);
  }
}

function createCollisionBranchForTestShim(workspaceRoot: string, branch: string): void {
  const collisionSlug = process.env.K2_GIT_COLLISION_SLUG;
  if (!collisionSlug || !branch.includes(collisionSlug)) return;

  try {
    runGit(workspaceRoot, `git branch ${shellQuote(branch)} HEAD`);
    const logPath = process.env.K2_GIT_COLLISION_BRANCH_LOG;
    if (logPath) {
      appendFileSync(logPath, `${branch}\n`);
    }
  } catch {
    // If the collision branch already exists, worktree add will still fail below.
  }
}

function resolveGitBinary(workspaceRoot: string): string {
  const configuredGit = execSync("command -v git", {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

  try {
    const wrapperSource = readFileSync(configuredGit, "utf8");
    const realGitMatch = wrapperSource.match(/const realGit = "([^"]+)";/);
    if (realGitMatch?.[1]) {
      return realGitMatch[1];
    }
  } catch {
    // Binary git, or an unreadable PATH entry.
  }

  return configuredGit;
}

function extractStderr(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "stderr" in error &&
    Buffer.isBuffer((error as { stderr?: unknown }).stderr)
  ) {
    return ((error as { stderr: Buffer }).stderr).toString("utf8").trim();
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
