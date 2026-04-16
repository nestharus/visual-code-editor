import type { DiagramDiffRecord, DiagramDiffStatus } from "../lib/diagram-data";

export type DiffStatusMap = Map<string, DiagramDiffStatus>;

export function buildDiffStatusMap(diff: DiagramDiffRecord | null | undefined): DiffStatusMap {
  const map = new Map<string, DiagramDiffStatus>();
  if (!diff) return map;
  for (const change of diff.addedNodes) {
    map.set(change.id, "added");
  }
  for (const change of diff.removedNodes) {
    map.set(change.id, "removed");
  }
  return map;
}

export function diffStatusFor(
  map: DiffStatusMap | undefined,
  nodeId: string,
): DiagramDiffStatus | undefined {
  return map?.get(nodeId);
}
