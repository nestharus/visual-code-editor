import { useNavigate, useParams } from "@tanstack/solid-router";
import { Show, createEffect, createMemo } from "solid-js";
import { useDiagramShellContext } from "../components/AppShell";
import { useDiagramData, type DiagramData } from "../lib/diagram-data";
import { ParentSummary } from "../components/ParentSummary";

type DiagramViewProps = {
  view: "organizational" | "behavioral";
  level?: "cluster" | "system" | "lifecycle" | "stage";
};

type DiagramSlice =
  | DiagramData["organizational"]["root"]
  | DiagramData["organizational"]["clusters"][string]
  | DiagramData["organizational"]["systems"][string]
  | DiagramData["behavioral"]["root"]
  | DiagramData["behavioral"]["lifecycles"][string]
  | DiagramData["behavioral"]["stages"][string];

type SearchState = Record<string, unknown>;

function clearPanelSearch(prev: SearchState) {
  const next = { ...prev };
  delete next.panelKind;
  delete next.panelId;
  delete next.panelLabel;
  return next;
}

function routeFallbackTitle(
  view: DiagramViewProps["view"],
  level: DiagramViewProps["level"],
  params: Record<string, string | undefined>,
) {
  if (level === "cluster") return params.clusterId || "Cluster";
  if (level === "system") return params.systemId || "System";
  if (level === "lifecycle") return params.lifecycleId || "Lifecycle";
  if (level === "stage") return params.stageId || "Stage";
  return view === "behavioral" ? "Behavioral Root" : "Organizational Root";
}

export function DiagramView(props: DiagramViewProps) {
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const diagramQuery = useDiagramData();
  const shell = useDiagramShellContext();

  const slice = createMemo<DiagramSlice | undefined>(() => {
    const data = diagramQuery.data;
    const routeParams = params();
    if (!data) return undefined;

    if (props.view === "organizational") {
      if (props.level === "cluster") {
        return data.organizational.clusters[routeParams.clusterId || ""];
      }
      if (props.level === "system") {
        return data.organizational.systems[routeParams.systemId || ""];
      }
      return data.organizational.root;
    }

    if (props.level === "lifecycle") {
      return data.behavioral.lifecycles[routeParams.lifecycleId || ""];
    }
    if (props.level === "stage") {
      return data.behavioral.stages[routeParams.stageId || ""];
    }
    return data.behavioral.root;
  });

  const sliceDataById = createMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const element of slice()?.elements || []) {
      const data = element.data;
      if (data && typeof data === "object" && "id" in data && typeof data.id === "string") {
        map.set(data.id, data as Record<string, unknown>);
      }
    }
    return map;
  });

  const elements = createMemo(() => slice()?.elements || []);
  const mermaidText = createMemo(() => slice()?.mermaid || undefined);

  const title = createMemo(() => {
    const currentSlice = slice();
    if (currentSlice?.label) return currentSlice.label;
    return routeFallbackTitle(props.view, props.level, params());
  });

  const openPanel = (panelKind: string, panelId: string, panelLabel?: string) => {
    navigate({
      search: (prev: SearchState) => {
        const next = {
          ...prev,
          panelKind,
          panelId,
        } as SearchState;
        if (panelLabel) {
          next.panelLabel = panelLabel;
        } else {
          delete next.panelLabel;
        }
        return next;
      },
    });
  };

  const onNodeTap = (nodeId: string, kind: string, label: string) => {
    const data = diagramQuery.data;
    const routeParams = params();
    const nodeData = sliceDataById().get(nodeId);
    const panelId =
      kind === "store" && typeof nodeData?.storeId === "string" ? nodeData.storeId : nodeId;
    const panelLabel =
      (typeof nodeData?.label === "string" ? nodeData.label : label) || panelId;

    if (kind === "cluster") {
      navigate({
        to: `/organizational/clusters/${nodeId}`,
        search: clearPanelSearch,
      });
      return;
    }

    if (kind === "system" || kind === "external") {
      const clusterId = data?.organizational.systems[nodeId]?.clusterId || routeParams.clusterId;
      if (clusterId) {
        navigate({
          to: `/organizational/clusters/${clusterId}/systems/${nodeId}`,
          search: clearPanelSearch,
        });
        return;
      }
    }

    if (kind === "lifecycle") {
      navigate({
        to: `/behavioral/lifecycles/${nodeId}`,
        search: clearPanelSearch,
      });
      return;
    }

    if (kind === "stage") {
      const lifecycleId = data?.behavioral.stages[nodeId]?.lifecycleId || routeParams.lifecycleId;
      if (lifecycleId) {
        navigate({
          to: `/behavioral/lifecycles/${lifecycleId}/stages/${nodeId}`,
          search: clearPanelSearch,
        });
        return;
      }
    }

    openPanel(kind || "node", panelId, panelLabel);
  };

  const onEdgeTap = (edgeId: string, kind: string, label: string) => {
    const edgeData = sliceDataById().get(edgeId);
    const panelKind =
      kind || (typeof edgeData?.kind === "string" ? edgeData.kind : "edge");
    const panelLabel =
      label || (typeof edgeData?.label === "string" ? edgeData.label : edgeId);

    openPanel(panelKind, edgeId, panelLabel);
  };

  const parentSummary = createMemo(() => {
    const data = diagramQuery.data;
    const routeParams = params();
    if (!data || !props.level) return null;

    if (props.level === "cluster") {
      const clusterId = routeParams.clusterId || "";
      const cluster = data.organizational.clusters[clusterId];
      if (!cluster) return null;
      const detail = data.details[clusterId];
      const childCount =
        typeof detail?.systemCount === "number"
          ? detail.systemCount
          : Array.isArray(detail?.systems)
            ? detail.systems.length
            : undefined;
      return {
        parentKind: "cluster",
        parentId: clusterId,
        parentLabel: cluster.label,
        parentDescription:
          typeof detail?.description === "string" ? detail.description : undefined,
        childCount,
      };
    }

    if (props.level === "system") {
      const systemId = routeParams.systemId || "";
      const system = data.organizational.systems[systemId];
      if (!system) return null;
      const detail = data.details[systemId];
      const childCount =
        (typeof detail?.fileCount === "number" ? detail.fileCount : system.fileCount || 0) +
        (typeof detail?.agentCount === "number" ? detail.agentCount : system.agentCount || 0);
      return {
        parentKind: "system",
        parentId: systemId,
        parentLabel: system.label,
        parentDescription:
          typeof detail?.description === "string" ? detail.description : undefined,
        childCount,
      };
    }

    if (props.level === "lifecycle") {
      const lifecycleId = routeParams.lifecycleId || "";
      const lifecycle = data.behavioral.lifecycles[lifecycleId];
      if (!lifecycle) return null;
      const detail = data.details[lifecycleId];
      const childCount = Array.isArray(lifecycle.stageIds) ? lifecycle.stageIds.length : undefined;
      return {
        parentKind: "lifecycle",
        parentId: lifecycleId,
        parentLabel: lifecycle.label,
        parentDescription:
          typeof lifecycle.description === "string"
            ? lifecycle.description
            : typeof detail?.description === "string"
              ? detail.description
              : undefined,
        childCount,
      };
    }

    if (props.level === "stage") {
      const stageId = routeParams.stageId || "";
      const stage = data.behavioral.stages[stageId];
      if (!stage) return null;
      const detail = data.details[stageId];
      const childCount = Array.isArray(stage.stepIds) ? stage.stepIds.length : undefined;
      return {
        parentKind: "stage",
        parentId: stageId,
        parentLabel: stage.label,
        parentDescription:
          typeof stage.description === "string"
            ? stage.description
            : typeof detail?.description === "string"
              ? detail.description
              : undefined,
        childCount,
      };
    }

    return null;
  });

  createEffect(() => {
    slice();
    mermaidText();
    title();

    shell.publish({
      elements,
      mermaidText,
      onNodeTap,
      onEdgeTap,
      title,
      view: () => props.view,
      level: () => props.level,
    });
  });

  return (
    <div
      class="diagram-view"
      style={{
        position: "relative",
        padding: "16px 20px 0",
        "pointer-events": "none",
      }}
    >
      <Show when={parentSummary()}>
        {(summary) => (
          <ParentSummary
            parentKind={summary().parentKind}
            parentId={summary().parentId}
            parentLabel={summary().parentLabel}
            parentDescription={summary().parentDescription}
            childCount={summary().childCount}
            onExpand={() =>
              openPanel(summary().parentKind, summary().parentId, summary().parentLabel)
            }
          />
        )}
      </Show>
      <div class="diagram-view__header">
        <h2>{title()}</h2>
      </div>
    </div>
  );
}
