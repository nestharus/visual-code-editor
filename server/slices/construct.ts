import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ConstructSliceRequest, Slice } from "./types";
import { makeSlice } from "./types";

type DiagramRecord = Record<string, unknown>;

type SearchRecord = {
  id: string;
  label: string;
  parentId: string | null;
  behaviourIds: readonly string[];
};

type EdgeRecord = {
  id: string;
  from: string;
  to: string;
  mechanismKind: string | null;
};

type DiagramIndex = {
  entities: readonly SearchRecord[];
  entitiesById: ReadonlyMap<string, SearchRecord>;
  edges: readonly EdgeRecord[];
  childrenByParentId: ReadonlyMap<string, readonly string[]>;
  behaviourIdsByEntityId: ReadonlyMap<string, ReadonlySet<string>>;
};

export type ConstructSliceOutcome =
  | { ok: true; slice: Slice }
  | { ok: false; error_kind: "no-matches"; error: string };

export function constructSliceFromDiagramPath(
  request: ConstructSliceRequest,
  diagramJsonPath: string,
): ConstructSliceOutcome {
  const diagramData = JSON.parse(readFileSync(diagramJsonPath, "utf-8"));
  return constructSlice(request, diagramData);
}

export function constructSlice(
  request: ConstructSliceRequest,
  diagramData: unknown,
): ConstructSliceOutcome {
  const index = buildDiagramIndex(diagramData);
  const matchedEntityIds = matchEntities(index.entities, request.query);

  if (matchedEntityIds.length === 0) {
    return {
      ok: false,
      error_kind: "no-matches",
      error: "no entities matched the query",
    };
  }

  const neighbourhoodEntityIds = neighbourhoodForRule(
    request.rule,
    matchedEntityIds,
    index,
  );
  const createdAtMs = Date.now();
  const slice = makeSlice({
    id: buildSliceId({
      query: request.query,
      rule: request.rule,
      matchedEntityIds,
      neighbourhoodEntityIds,
      createdAtMs,
    }),
    query: request.query,
    matchedEntityIds,
    neighbourhoodEntityIds,
    rule: request.rule,
    lifecycleState: "active",
    ttlMs: createdAtMs + request.defaultTtlMs,
    createdBy: request.actor,
    createdAtMs,
    pinnedAtMs: null,
    trust: { state: "grounded", grounding: "lsp-type" },
  });

  return { ok: true, slice };
}

function buildDiagramIndex(diagramData: unknown): DiagramIndex {
  const entityMap = new Map<string, SearchRecord>();
  const edgeMap = new Map<string, EdgeRecord>();

  const details = recordAt(diagramData, "details");
  if (details) {
    for (const [id, value] of Object.entries(details)) {
      if (!isRecord(value)) continue;
      const recordId = stringField(value, "id") ?? id;
      addEntity(entityMap, value, recordId);
      addEdge(edgeMap, value, recordId);
    }
  }

  walkDiagramCollections(diagramData, (record) => {
    const data = isRecord(record.data) ? record.data : record;
    const id = stringField(data, "id");
    if (!id) return;

    addEntity(entityMap, data, id);
    addEdge(edgeMap, data, id);
  });

  const entities = Array.from(entityMap.values());
  const childrenByParentId = new Map<string, string[]>();
  const behaviourIdsByEntityId = new Map<string, Set<string>>();

  for (const entity of entities) {
    if (entity.parentId) {
      const siblings = childrenByParentId.get(entity.parentId) ?? [];
      siblings.push(entity.id);
      childrenByParentId.set(entity.parentId, siblings);
    }

    if (entity.behaviourIds.length > 0) {
      behaviourIdsByEntityId.set(entity.id, new Set(entity.behaviourIds));
    }
  }

  addCombinedBindings(diagramData, behaviourIdsByEntityId);

  return {
    entities,
    entitiesById: entityMap,
    edges: Array.from(edgeMap.values()),
    childrenByParentId,
    behaviourIdsByEntityId,
  };
}

function walkDiagramCollections(
  value: unknown,
  visit: (record: DiagramRecord) => void,
): void {
  if (!isRecord(value)) return;

  for (const collectionName of ["elements", "nodes", "edges"] as const) {
    const collection = value[collectionName];
    if (Array.isArray(collection)) {
      for (const item of collection) {
        if (isRecord(item)) visit(item);
      }
    }
  }

  for (const child of Object.values(value)) {
    if (isRecord(child) || Array.isArray(child)) {
      walkNested(child, visit);
    }
  }
}

function walkNested(value: unknown, visit: (record: DiagramRecord) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walkNested(item, visit);
    return;
  }

  if (!isRecord(value)) return;

  for (const collectionName of ["elements", "nodes", "edges"] as const) {
    const collection = value[collectionName];
    if (Array.isArray(collection)) {
      for (const item of collection) {
        if (isRecord(item)) visit(item);
      }
    }
  }

  for (const child of Object.values(value)) {
    if (isRecord(child) || Array.isArray(child)) {
      walkNested(child, visit);
    }
  }
}

function addEntity(
  entityMap: Map<string, SearchRecord>,
  record: DiagramRecord,
  fallbackId: string,
): void {
  const id = stringField(record, "id") ?? fallbackId;
  const kind = stringField(record, "kind");
  if (kind === "edge") return;

  const existing = entityMap.get(id);
  const label = stringField(record, "label") ?? existing?.label ?? id;
  const parentId = parentIdFor(record) ?? existing?.parentId ?? null;
  const behaviourIds = uniqueStrings([
    ...(existing?.behaviourIds ?? []),
    ...behaviourIdsFor(record),
  ]);

  entityMap.set(id, { id, label, parentId, behaviourIds });
}

function addEdge(
  edgeMap: Map<string, EdgeRecord>,
  record: DiagramRecord,
  fallbackId: string,
): void {
  const id = stringField(record, "id") ?? stringField(record, "edge_id") ?? fallbackId;
  const from = stringField(record, "from") ?? stringField(record, "source");
  const to = stringField(record, "to") ?? stringField(record, "target");
  if (!id || !from || !to) return;

  const transfer = isRecord(record.transfer) ? record.transfer : undefined;
  const mechanismKind =
    stringField(record, "mechanism_kind") ??
    stringField(record, "mechanismKind") ??
    stringField(transfer, "mechanism_kind") ??
    stringField(transfer, "mechanismKind") ??
    stringField(record, "kind");

  edgeMap.set(id, { id, from, to, mechanismKind });
}

function matchEntities(
  entities: readonly SearchRecord[],
  query: string,
): readonly string[] {
  const normalizedQuery = query.toLowerCase();
  const matchedEntityIds: string[] = [];

  for (const entity of entities) {
    if (
      entity.id.toLowerCase().includes(normalizedQuery) ||
      entity.label.toLowerCase().includes(normalizedQuery)
    ) {
      matchedEntityIds.push(entity.id);
    }
  }

  return uniqueStrings(matchedEntityIds);
}

function neighbourhoodForRule(
  rule: ConstructSliceRequest["rule"],
  matchedEntityIds: readonly string[],
  index: DiagramIndex,
): readonly string[] {
  const matchedEntityIdSet = new Set(matchedEntityIds);
  const neighbourhood = new Set<string>();

  switch (rule.kind) {
    case "exact":
      break;
    case "direct-neighbours":
      addDirectNeighbours(matchedEntityIds, index.edges, neighbourhood);
      break;
    case "transitive-by-edge-kind":
      addTransitiveByEdgeKind(matchedEntityIds, index.edges, rule.edgeKinds, rule.maxHops, neighbourhood);
      break;
    case "shared-behaviour":
      addSharedBehaviour(matchedEntityIds, index.behaviourIdsByEntityId, neighbourhood);
      break;
    case "shared-container":
      addSharedContainer(matchedEntityIds, index, neighbourhood);
      break;
  }

  return Array.from(neighbourhood).filter((entityId) => !matchedEntityIdSet.has(entityId));
}

function addDirectNeighbours(
  matchedEntityIds: readonly string[],
  edges: readonly EdgeRecord[],
  neighbourhood: Set<string>,
): void {
  const frontier = new Set(matchedEntityIds);
  for (const edge of edges) {
    if (frontier.has(edge.from)) neighbourhood.add(edge.to);
    if (frontier.has(edge.to)) neighbourhood.add(edge.from);
  }
}

function addTransitiveByEdgeKind(
  matchedEntityIds: readonly string[],
  edges: readonly EdgeRecord[],
  edgeKinds: readonly string[],
  maxHops: number,
  neighbourhood: Set<string>,
): void {
  const allowedKinds = new Set(edgeKinds);
  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    if (!edge.mechanismKind || !allowedKinds.has(edge.mechanismKind)) continue;
    const fromNeighbours = adjacency.get(edge.from) ?? [];
    fromNeighbours.push(edge.to);
    adjacency.set(edge.from, fromNeighbours);
    const toNeighbours = adjacency.get(edge.to) ?? [];
    toNeighbours.push(edge.from);
    adjacency.set(edge.to, toNeighbours);
  }

  const visited = new Set(matchedEntityIds);
  let frontier = [...matchedEntityIds];
  for (let hop = 0; hop < maxHops && frontier.length > 0; hop += 1) {
    const nextFrontier: string[] = [];
    for (const entityId of frontier) {
      for (const neighbourId of adjacency.get(entityId) ?? []) {
        if (visited.has(neighbourId)) continue;
        visited.add(neighbourId);
        neighbourhood.add(neighbourId);
        nextFrontier.push(neighbourId);
      }
    }
    frontier = nextFrontier;
  }
}

function addSharedBehaviour(
  matchedEntityIds: readonly string[],
  behaviourIdsByEntityId: ReadonlyMap<string, ReadonlySet<string>>,
  neighbourhood: Set<string>,
): void {
  const matchedBehaviourIds = new Set<string>();
  for (const entityId of matchedEntityIds) {
    for (const behaviourId of behaviourIdsByEntityId.get(entityId) ?? []) {
      matchedBehaviourIds.add(behaviourId);
    }
  }

  if (matchedBehaviourIds.size === 0) return;

  for (const [entityId, behaviourIds] of behaviourIdsByEntityId) {
    for (const behaviourId of behaviourIds) {
      if (matchedBehaviourIds.has(behaviourId)) {
        neighbourhood.add(entityId);
        break;
      }
    }
  }
}

function addSharedContainer(
  matchedEntityIds: readonly string[],
  index: DiagramIndex,
  neighbourhood: Set<string>,
): void {
  for (const entityId of matchedEntityIds) {
    const entity = index.entitiesById.get(entityId);
    if (!entity?.parentId) continue;
    for (const siblingId of index.childrenByParentId.get(entity.parentId) ?? []) {
      neighbourhood.add(siblingId);
    }
  }
}

function addCombinedBindings(
  diagramData: unknown,
  behaviourIdsByEntityId: Map<string, Set<string>>,
): void {
  if (!isRecord(diagramData)) return;
  const combined = isRecord(diagramData.combined) ? diagramData.combined : undefined;
  const bindings = isRecord(combined?.bindings) ? combined.bindings : undefined;
  if (!bindings) return;

  for (const [entityId, value] of Object.entries(bindings)) {
    const ids = stringArray(value);
    if (ids.length === 0) continue;
    const current = behaviourIdsByEntityId.get(entityId) ?? new Set<string>();
    for (const id of ids) current.add(id);
    behaviourIdsByEntityId.set(entityId, current);
  }
}

function behaviourIdsFor(record: DiagramRecord): readonly string[] {
  const transfer = isRecord(record.transfer) ? record.transfer : undefined;
  return uniqueStrings([
    ...stringArray(record.bindings),
    ...stringArray(record.references),
    ...stringArray(record.behaviorIds),
    ...stringArray(record.behaviourIds),
    ...stringArray(record.behavior_ids),
    ...stringArray(record.behaviour_ids),
    ...stringArray(record.behaviour_candidates),
    ...stringArray(record.behavior_candidates),
    ...stringArray(transfer?.behaviour_candidates),
    ...stringArray(transfer?.behavior_candidates),
  ]);
}

function parentIdFor(record: DiagramRecord): string | null {
  return (
    stringField(record, "parent") ??
    stringField(record, "parentId") ??
    stringField(record, "parent_id") ??
    stringField(record, "moduleId") ??
    stringField(record, "systemId") ??
    null
  );
}

function buildSliceId(seed: Record<string, unknown>): string {
  const createdAtMs = typeof seed.createdAtMs === "number" ? seed.createdAtMs : Date.now();
  const hash = createHash("sha256").update(JSON.stringify(seed)).digest("hex").slice(0, 12);
  return `slice:${hash}-${createdAtMs.toString(36)}`;
}

function recordAt(value: unknown, key: string): DiagramRecord | null {
  if (!isRecord(value)) return null;
  const child = value[key];
  return isRecord(child) ? child : null;
}

function stringField(record: DiagramRecord | undefined, field: string): string | null {
  const value = record?.[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

function isRecord(value: unknown): value is DiagramRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
