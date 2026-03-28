import { useNavigate, useParams } from "@tanstack/solid-router";
import { createMemo, createSignal } from "solid-js";
import type { Core } from "cytoscape";
import { DiagramCanvas } from "../components/DiagramCanvas";
import { HoverOverlay } from "../components/HoverOverlay";
import { NodeActionOverlay } from "../components/NodeActionOverlay";
import { cytoscapeStyle } from "../lib/cytoscape-style";
import { useDiagramData, type DiagramData } from "../lib/diagram-data";

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
  const [cy, setCy] = createSignal<Core | undefined>();
  const [container, setContainer] = createSignal<HTMLDivElement | undefined>();

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

  return (
    <div class="diagram-view" style={{ position: "relative" }}>
      <div class="diagram-view__header">
        <h2>{title()}</h2>
      </div>
      <div style={{ position: "relative" }}>
        <DiagramCanvas
          elements={elements()}
          mermaidText={mermaidText()}
          style={cytoscapeStyle}
          onNodeTap={onNodeTap}
          onEdgeTap={onEdgeTap}
          onReady={(cyInstance, containerEl) => {
            setCy(cyInstance);
            setContainer(containerEl);
          }}
        />
        <HoverOverlay cy={cy()} container={container()} />
        <NodeActionOverlay cy={cy()} container={container()} />
      </div>
    </div>
  );
}
