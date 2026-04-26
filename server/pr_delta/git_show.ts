import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitShowError extends Error {
  readonly stderr: string;

  constructor(message: string, stderr: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GitShowError";
    this.stderr = stderr;
  }
}

export async function getFileAtRevision(
  workspaceRoot: string,
  revision: string,
  filePath: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", workspaceRoot, "show", `${revision}:${filePath}`],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    return stdout;
  } catch (error) {
    const stderr = stderrFromError(error);
    if (isMissingPathAtRevision(stderr)) {
      return null;
    }
    throw new GitShowError(`failed to read ${filePath} at ${revision}`, stderr, {
      cause: error,
    });
  }
}

function isMissingPathAtRevision(stderr: string): boolean {
  return (
    stderr.includes("exists on disk, but not in") ||
    stderr.includes("does not exist in") ||
    stderr.includes("Path") && stderr.includes("does not exist")
  );
}

function stderrFromError(error: unknown): string {
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    if (typeof stderr === "string") return stderr;
    if (Buffer.isBuffer(stderr)) return stderr.toString("utf8");
  }
  return error instanceof Error ? error.message : "";
}
