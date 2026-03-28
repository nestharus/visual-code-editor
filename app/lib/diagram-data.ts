import { createQuery } from "@tanstack/solid-query";
import type { ElementDefinition } from "cytoscape";

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
  elements: ElementDefinition[];
  mermaid?: string;
  edgeClickMap?: Record<string, DiagramEdgeRecord>;
  nodeTargetMap?: Record<string, DiagramNodeTarget>;
  [key: string]: unknown;
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
