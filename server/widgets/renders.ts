import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  makeRenderSnapshot,
  type RenderSnapshot,
} from "../../app/lib/render-snapshot";

export interface WidgetRenderResult {
  renders: readonly RenderSnapshot[];
}

export async function readWidgetRenders(options: {
  workspaceRoot: string;
  widgetId: string;
}): Promise<WidgetRenderResult> {
  const widgetSuffix = widgetSuffixFromId(options.widgetId);
  if (widgetSuffix === null) {
    throw new Error("widget id must match ^widget:[a-zA-Z0-9._-]+$");
  }

  const renderDir = join(
    options.workspaceRoot,
    "public",
    "data",
    "widget-renders",
    widgetSuffix,
  );

  let entries: string[];
  try {
    entries = await readdir(renderDir);
  } catch (error) {
    if (isNotFoundError(error)) {
      return { renders: [] };
    }
    throw error;
  }

  const jsonFiles = entries
    .filter((entry) => entry.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));

  const renders: RenderSnapshot[] = [];
  for (const jsonFile of jsonFiles) {
    const raw = await readFile(join(renderDir, jsonFile), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    renders.push(...rendersFromPayload(parsed));
  }

  return { renders };
}

function widgetSuffixFromId(widgetId: string): string | null {
  const prefix = "widget:";
  const suffix = widgetId.startsWith(prefix) ? widgetId.slice(prefix.length) : "";
  return /^[a-zA-Z0-9._-]+$/.test(suffix) ? suffix : null;
}

function rendersFromPayload(payload: unknown): RenderSnapshot[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("render index must be an object");
  }

  const candidate = payload as { renders?: unknown };
  if (!Array.isArray(candidate.renders)) {
    throw new Error("render index renders must be an array");
  }

  return candidate.renders.map((render) => makeRenderSnapshotFromUnknown(render));
}

function makeRenderSnapshotFromUnknown(render: unknown): RenderSnapshot {
  if (!render || typeof render !== "object") {
    throw new Error("render snapshot must be an object");
  }

  const candidate = render as Record<string, unknown>;
  const trust = candidate.trust;
  if (!trust || typeof trust !== "object") {
    throw new Error("render snapshot trust must be an object");
  }

  const trustCandidate = trust as Record<string, unknown>;
  return makeRenderSnapshot({
    id: requireString(candidate.id, "render snapshot id"),
    widgetId: requireString(candidate.widgetId, "render snapshot widgetId"),
    surface: requireString(candidate.surface, "render snapshot surface"),
    viewport: requireString(candidate.viewport, "render snapshot viewport"),
    theme: requireString(candidate.theme, "render snapshot theme"),
    locale: requireString(candidate.locale, "render snapshot locale"),
    assetPath: requireString(candidate.assetPath, "render snapshot assetPath"),
    capturedAtMs: requireNumber(
      candidate.capturedAtMs,
      "render snapshot capturedAtMs",
    ),
    trust: {
      state: requireString(trustCandidate.state, "render snapshot trust state"),
      grounding:
        trustCandidate.grounding === null
          ? null
          : requireString(
              trustCandidate.grounding,
              "render snapshot trust grounding",
            ),
    },
  } as RenderSnapshot);
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  return value;
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  return value;
}

function isNotFoundError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
