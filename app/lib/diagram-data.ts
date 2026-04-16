import { createQuery } from "@tanstack/solid-query";
import type { DiagramElementDefinition } from "./diagram-elements";

const DEFAULT_WATCHER_URL = "http://localhost:3001";

export const WATCHER_URL =
  typeof window !== "undefined"
    ? ((window as Window & typeof globalThis & { __WATCHER_URL?: string }).__WATCHER_URL ??
      DEFAULT_WATCHER_URL)
    : DEFAULT_WATCHER_URL;

export type DiagramDetailRecord = Record<string, unknown> & {
  id?: string;
  kind?: string;
  label?: string;
  href?: string;
};

export type DiagramEdgeRecord = Record<string, unknown> & {
  label?: string;
  from?: string;
  to?: string;
};

export type DiagramNodeTarget = {
  kind: string;
  id: string;
};

export type DiagramSlice = {
  id?: string;
  label?: string;
  elements: DiagramElementDefinition[];
  mermaid?: string;
  edgeClickMap?: Record<string, DiagramEdgeRecord>;
  nodeTargetMap?: Record<string, DiagramNodeTarget>;
  [key: string]: unknown;
};

export type DiagramCodeBlock = {
  id: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  language?: string;
  symbol?: string;
  content?: string;
};

export type DiagramCodeIndex = {
  byEntity: Record<string, string[]>;
  blocks: Record<string, DiagramCodeBlock>;
};

export type DiagramEntityTestRecord = {
  status: "failed" | "passed" | "skipped" | "not-run";
  passing: number;
  failing: number;
  skipped?: number;
  coveragePct?: number | null;
  scope?: "direct" | "rollup";
};

export type DiagramTests = {
  run: {
    id: string;
    source: "fixture";
    generatedAt: string;
    status: "failed" | "passed";
    passed: number;
    failed: number;
    skipped: number;
  };
  byEntity: Record<string, DiagramEntityTestRecord>;
};

export type DiagramDiffStatus = "added" | "removed";

export type DiagramDiffNodeChange = {
  id: string;
  status: DiagramDiffStatus;
  label?: string;
  kind?: string;
  reason?: string;
};

export type DiagramDiffRecord = {
  id: string;
  title: string;
  subtitle?: string;
  source: "fixture";
  summary: {
    addedNodes: number;
    removedNodes: number;
  };
  addedNodes: DiagramDiffNodeChange[];
  removedNodes: DiagramDiffNodeChange[];
};

export type DiagramDiffs = {
  defaultDiffId: string;
  byId: Record<string, DiagramDiffRecord>;
};

export type DiagramData = {
  organizational: {
    root: DiagramSlice;
    clusters: Record<
      string,
      DiagramSlice & {
        id: string;
        label: string;
        color?: string;
      }
    >;
    systems: Record<
      string,
      DiagramSlice & {
        id: string;
        label: string;
        clusterId: string;
        clusterColor?: string;
        fileCount?: number;
        agentCount?: number;
      }
    >;
  };
  behavioral: {
    available: boolean;
    root: DiagramSlice;
    lifecycles: Record<
      string,
      DiagramSlice & {
        id: string;
        label: string;
        description?: string;
        stageIds?: string[];
      }
    >;
    stages: Record<
      string,
      DiagramSlice & {
        id: string;
        label: string;
        description?: string;
        lifecycleId?: string;
        stepIds?: string[];
      }
    >;
  };
  combined?: {
    scenarios: Record<string, {
      id: string;
      behaviorId: string;
      title: string;
      caption?: string;
      participants: string[];
      beats: Array<{
        id: string;
        kind: "path" | "subScenario";
        caption?: string;
        fromNodeId?: string;
        toNodeId?: string;
        edgeIds?: string[];
        participantNodeIds?: string[];
        scenarioId?: string;
        entryNodeId?: string;
        exitNodeId?: string;
      }>;
    }>;
    bindings: Record<string, string[]>;
  };
  tests?: DiagramTests;
  diffs?: DiagramDiffs;
  code?: DiagramCodeIndex;
  details: Record<string, DiagramDetailRecord>;
};

export async function fetchDiagramData(): Promise<DiagramData> {
  const response = await fetch(`${WATCHER_URL}/api/diagram`);
  if (!response.ok) {
    throw new Error(`Failed to fetch diagram data: ${response.status}`);
  }
  return response.json();
}

export function useDiagramData() {
  return createQuery(() => ({
    queryKey: ["diagram"],
    queryFn: fetchDiagramData,
    staleTime: 30_000,
  }));
}
