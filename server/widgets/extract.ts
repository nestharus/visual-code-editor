import { spawn } from "node:child_process";
import type { Widget, WidgetExtractionResult } from "./types";
import { WidgetExtractionError } from "./types";

type CacheEntry = {
  workspaceRoot: string;
  result: WidgetExtractionResult;
};

let cacheEntry: CacheEntry | null = null;

export async function extractWidgets(options: {
  workspaceRoot: string;
  refresh?: boolean;
}): Promise<WidgetExtractionResult> {
  const ttlMs = envTtlMs();
  const now = Date.now();

  if (
    !options.refresh &&
    cacheEntry &&
    cacheEntry.workspaceRoot === options.workspaceRoot &&
    now - cacheEntry.result.computed_at_ms < ttlMs
  ) {
    return cacheEntry.result;
  }

  const widgets = await runWidgetExtractor(options.workspaceRoot);
  const result = {
    widgets,
    computed_at_ms: Date.now(),
  };
  cacheEntry = {
    workspaceRoot: options.workspaceRoot,
    result,
  };
  return result;
}

function runWidgetExtractor(workspaceRoot: string): Promise<Widget[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PYTHON ?? "python3",
      [
        "-m",
        "src.visual_code_editor.widget_extractor_cli",
        "--workspace-root",
        workspaceRoot,
      ],
      {
        cwd: workspaceRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const finish = (error: WidgetExtractionError | null, widgets?: Widget[]) => {
      if (settled) return;
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve(widgets ?? []);
    };

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on("error", (error) => {
      finish(
        new WidgetExtractionError(
          "internal",
          `failed to start widget extractor: ${error.message}`,
          { cause: error },
        ),
      );
    });

    child.on("close", (code) => {
      if (settled) return;

      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (code !== 0) {
        finish(
          new WidgetExtractionError(
            "extraction",
            stderr || `widget extractor exited with code ${code}`,
          ),
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as unknown;
        if (!Array.isArray(parsed)) {
          throw new Error("extractor output must be an array");
        }
        finish(null, parsed as Widget[]);
      } catch (error) {
        finish(
          new WidgetExtractionError(
            "extraction",
            error instanceof Error
              ? `invalid widget extractor output: ${error.message}`
              : "invalid widget extractor output",
            { cause: error },
          ),
        );
      }
    });
  });
}

function envTtlMs(): number {
  const value = Number.parseInt(process.env.WIDGET_EXTRACT_TTL_MS ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : 60_000;
}
