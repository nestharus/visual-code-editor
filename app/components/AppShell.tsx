import { useNavigate, useLocation, Link } from "@tanstack/solid-router";
import type { Core, ElementDefinition } from "cytoscape";
import {
  createContext,
  createMemo,
  createSignal,
  useContext,
  type ParentComponent,
} from "solid-js";
import { DetailPanel } from "./DetailPanel";
import { DiagramCanvas, setNavDirection } from "./DiagramCanvas";
import { HoverOverlay } from "./HoverOverlay";
import { NodeActionOverlay } from "./NodeActionOverlay";
import { useWatchSubscription } from "../lib/live/useWatchSubscription";
import { cytoscapeStyle } from "../lib/cytoscape-style";
import { useDiagramData } from "../lib/diagram-data";

type DiagramShellData = {
  elements: () => ElementDefinition[];
  mermaidText: () => string | undefined;
  onNodeTap: (nodeId: string, kind: string, label: string) => void;
  onEdgeTap: (edgeId: string, kind: string, label: string) => void;
  title: () => string;
  view: () => "organizational" | "behavioral";
  level: () => string | undefined;
};

export const DiagramShellContext = createContext<{
  publish: (data: DiagramShellData) => void;
  cy: () => Core | undefined;
  container: () => HTMLDivElement | undefined;
}>();

export function useDiagramShellContext() {
  const context = useContext(DiagramShellContext);
  if (!context) {
    throw new Error("DiagramShellContext is only available inside AppShell.");
  }
  return context;
}

function getRouteDepth(level: string | undefined) {
  if (!level) return 0;
  if (level === "cluster" || level === "lifecycle") return 1;
  return 2;
}

export const AppShell: ParentComponent = (props) => {
  useWatchSubscription();
  const navigate = useNavigate();
  const location = useLocation();
  const diagramQuery = useDiagramData();
  const [cy, setCy] = createSignal<Core | undefined>();
  const [container, setContainer] = createSignal<HTMLDivElement | undefined>();
  const [diagramData, setDiagramData] = createSignal<DiagramShellData | undefined>();

  let previousRoute:
    | {
        depth: number;
        view: "organizational" | "behavioral";
      }
    | undefined;

  const publish = (data: DiagramShellData) => {
    const nextView = data.view();
    const nextDepth = getRouteDepth(data.level());

    if (previousRoute) {
      if (previousRoute.view === nextView && nextDepth < previousRoute.depth) {
        setNavDirection("back");
      } else {
        setNavDirection("forward");
      }
    }

    previousRoute = {
      depth: nextDepth,
      view: nextView,
    };
    setDiagramData(() => data);
  };

  const activeView = createMemo(() => {
    const path = location().pathname;
    if (path.startsWith("/organizational")) return "organizational";
    return "behavioral";
  });

  const breadcrumbs = createMemo(() => {
    const data = diagramQuery.data;
    const path = location().pathname;
    const parts: { label: string; href?: string }[] = [];

    if (path.startsWith("/organizational")) {
      parts.push({ label: "Organizational", href: "/organizational" });
      const clusterMatch = path.match(/\/clusters\/([^/]+)/);
      if (clusterMatch) {
        const clusterId = decodeURIComponent(clusterMatch[1]);
        parts.push({
          label: data?.organizational.clusters[clusterId]?.label || clusterId,
          href: `/organizational/clusters/${clusterMatch[1]}`,
        });
      }
      const systemMatch = path.match(/\/systems\/([^/]+)/);
      if (systemMatch) {
        const systemId = decodeURIComponent(systemMatch[1]);
        parts.push({
          label: data?.organizational.systems[systemId]?.label || systemId,
        });
      }
    } else {
      parts.push({ label: "Behavioral", href: "/behavioral" });
      const lifecycleMatch = path.match(/\/lifecycles\/([^/]+)/);
      if (lifecycleMatch) {
        const lifecycleId = decodeURIComponent(lifecycleMatch[1]);
        parts.push({
          label: data?.behavioral.lifecycles[lifecycleId]?.label || lifecycleId,
          href: `/behavioral/lifecycles/${lifecycleMatch[1]}`,
        });
      }
      const stageMatch = path.match(/\/stages\/([^/]+)/);
      if (stageMatch) {
        const stageId = decodeURIComponent(stageMatch[1]);
        parts.push({
          label: data?.behavioral.stages[stageId]?.label || stageId,
        });
      }
    }

    return parts;
  });

  return (
    <DiagramShellContext.Provider value={{ publish, cy, container }}>
      <div class="page-shell">
        <header class="toolbar">
          <div class="toolbar-title">
            <h1>Artifact Lifecycle</h1>
          </div>
          <div class="toolbar-actions">
            <div class="view-toggle" role="tablist">
              <button
                type="button"
                role="tab"
                classList={{
                  "view-toggle-btn": true,
                  "is-active": activeView() === "behavioral",
                }}
                aria-selected={activeView() === "behavioral"}
                onClick={() => navigate({ to: "/behavioral" })}
                data-view-toggle="behavioral"
              >
                Behavioral
              </button>
              <button
                type="button"
                role="tab"
                classList={{
                  "view-toggle-btn": true,
                  "is-active": activeView() === "organizational",
                }}
                aria-selected={activeView() === "organizational"}
                onClick={() => navigate({ to: "/organizational" })}
                data-view-toggle="organizational"
              >
                Organizational
              </button>
            </div>
          </div>
        </header>

        <nav id="breadcrumb" class="breadcrumb-bar">
          {breadcrumbs().map((crumb, i) => (
            <>
              {i > 0 && <span class="breadcrumb-sep">/</span>}
              {crumb.href && i < breadcrumbs().length - 1 ? (
                <Link href={crumb.href} class="breadcrumb-item">
                  {crumb.label}
                </Link>
              ) : (
                <span class="breadcrumb-current">{crumb.label}</span>
              )}
            </>
          ))}
        </nav>

        <div class="diagram-and-panel">
          <main id="diagram-viewport" style={{ position: "relative" }}>
            <div style={{ position: "relative" }}>
              <DiagramCanvas
                elements={diagramData()?.elements() || []}
                mermaidText={diagramData()?.mermaidText()}
                style={cytoscapeStyle}
                onNodeTap={(nodeId, kind, label) =>
                  diagramData()?.onNodeTap(nodeId, kind, label)
                }
                onEdgeTap={(edgeId, kind, label) =>
                  diagramData()?.onEdgeTap(edgeId, kind, label)
                }
                onReady={(cyInstance, containerEl) => {
                  setCy(cyInstance);
                  setContainer(containerEl);
                }}
              />
              <HoverOverlay cy={cy()} container={container()} />
              <NodeActionOverlay cy={cy()} container={container()} />
              <div
                style={{
                  position: "absolute",
                  inset: "0",
                  "pointer-events": "none",
                  "z-index": "1",
                }}
              >
                {props.children}
              </div>
            </div>
          </main>
          <DetailPanel />
        </div>
      </div>
    </DiagramShellContext.Provider>
  );
};
