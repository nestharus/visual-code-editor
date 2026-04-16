import { useNavigate, useLocation, Link } from "@tanstack/solid-router";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  Show,
  useContext,
  type ParentComponent,
} from "solid-js";
import { DetailPanel } from "./DetailPanel";
import { PromptDock } from "./PromptDock";
import { SearchOverlay } from "./SearchOverlay";
import { WatcherPanel } from "./WatcherPanel";
import { GraphSurface, type GraphSelectionApi } from "../graph/GraphSurface";
import type { GraphDefinition } from "../graph/layout/types";
import type { DiagramElementDefinition } from "../lib/diagram-elements";
import {
  useWatchSubscription,
  type WatcherState,
} from "../lib/live/useWatchSubscription";
import { useDiagramData, WATCHER_URL } from "../lib/diagram-data";

type DiagramShellData = {
  elements: () => DiagramElementDefinition[];
  mermaidText: () => string | undefined;
  onNodeTap: (nodeId: string, kind: string, label: string) => void;
  onEdgeTap: (edgeId: string, kind: string, label: string) => void;
};

export const DiagramShellContext = createContext<{
  publish: (data: DiagramShellData) => void;
}>();

export function useDiagramShellContext() {
  const context = useContext(DiagramShellContext);
  if (!context) {
    throw new Error("DiagramShellContext is only available inside AppShell.");
  }
  return context;
}

function sanitizeSearchGraph(
  graph: GraphDefinition | null | undefined,
  query: string,
): GraphDefinition | null {
  if (!graph) return null;

  const nodes = graph.nodes ?? [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (graph.edges ?? []).filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );

  return {
    ...graph,
    id: graph.id || `search:${query}`,
    nodes,
    edges,
  };
}

export const AppShell: ParentComponent = (props) => {
  const watcherState: WatcherState = useWatchSubscription();
  const navigate = useNavigate();
  const location = useLocation();
  const diagramQuery = useDiagramData();
  const [diagramData, setDiagramData] = createSignal<DiagramShellData | undefined>();
  const [searchActive, setSearchActive] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchGraph, setSearchGraph] = createSignal<GraphDefinition | null>(null);
  const [searchLoading, setSearchLoading] = createSignal(false);
  const [searchResultCount, setSearchResultCount] = createSignal(0);
  const [searchOpenRequest, setSearchOpenRequest] = createSignal(0);
  const [selectionApi, setSelectionApi] = createSignal<GraphSelectionApi | undefined>();
  const [watcherPanelOpen, setWatcherPanelOpen] = createSignal(false);
  const [promptDockOpen, setPromptDockOpen] = createSignal(false);
  const [testsVisible, setTestsVisible] = createSignal(initialTestsVisible());
  let searchRequestVersion = 0;

  function initialTestsVisible(): boolean {
    if (typeof window === "undefined") return true;
    const stored = window.sessionStorage?.getItem("testsVisible");
    if (stored === "false") return false;
    return true;
  }

  const publish = (data: DiagramShellData) => {
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

  const activeSearchGraph = createMemo<GraphDefinition | undefined>(() => {
    if (!searchActive()) return undefined;
    return (
      searchGraph() ?? {
        id: `search:${searchQuery() || "empty"}`,
        nodes: [],
        edges: [],
      }
    );
  });

  const selectedPromptNodes = createMemo(() => selectionApi()?.selectedNodes() ?? []);
  const testsData = createMemo(() => diagramQuery.data?.tests ?? null);
  const testByEntity = createMemo(() => testsData()?.byEntity ?? {});
  const hasTests = createMemo(() => Object.keys(testByEntity()).length > 0);

  createEffect(() => {
    location().pathname;
    selectionApi()?.clearSelection();
    setPromptDockOpen(false);
  });

  createEffect(() => {
    if (selectedPromptNodes().length === 0) {
      setPromptDockOpen(false);
    }
  });

  createEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage?.setItem("testsVisible", testsVisible() ? "true" : "false");
  });

  const handleSearch = async (query: string) => {
    const requestVersion = ++searchRequestVersion;
    setSearchQuery(query);
    setSearchLoading(true);
    setSearchActive(true);

    try {
      const response = await fetch(`${WATCHER_URL}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, pathname: location().pathname }),
      });

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      if (requestVersion !== searchRequestVersion) return;

      const graph = sanitizeSearchGraph(
        data?.graph as GraphDefinition | null | undefined,
        query,
      );
      setSearchGraph(graph);
      setSearchResultCount(graph?.nodes.length ?? 0);
    } catch {
      if (requestVersion !== searchRequestVersion) return;
      setSearchGraph(null);
      setSearchResultCount(0);
    } finally {
      if (requestVersion === searchRequestVersion) {
        setSearchLoading(false);
      }
    }
  };

  const handleClearSearch = () => {
    searchRequestVersion += 1;
    setSearchActive(false);
    setSearchQuery("");
    setSearchGraph(null);
    setSearchLoading(false);
    setSearchResultCount(0);
  };

  const handlePromptSubmit = async (prompt: string) => {
    const selection = selectedPromptNodes();
    if (selection.length === 0) {
      throw new Error("Select at least one entity before prompting.");
    }

    const response = await fetch(`${WATCHER_URL}/api/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pathname: location().pathname,
        prompt,
        selection,
      }),
    });

    if (!response.ok) {
      throw new Error("Prompt request failed");
    }

    const data = await response.json();
    if (!data || typeof data.response !== "string") {
      throw new Error("Prompt response missing text");
    }

    return data.response;
  };

  return (
    <DiagramShellContext.Provider value={{ publish }}>
      <div
        classList={{
          "page-shell": true,
          "has-prompt-dock": promptDockOpen() && selectedPromptNodes().length > 0,
        }}
      >
        <SearchOverlay
          onSearch={handleSearch}
          onClear={handleClearSearch}
          isSearchActive={searchActive()}
          searchQuery={searchQuery()}
          isLoading={searchLoading()}
          resultCount={searchResultCount()}
          openRequest={searchOpenRequest()}
        />
        <WatcherPanel
          isOpen={watcherPanelOpen()}
          status={watcherState.status}
          refreshing={watcherState.refreshing}
          lastInvalidation={watcherState.lastInvalidation}
          onClose={() => setWatcherPanelOpen(false)}
        />
        <header class="toolbar">
          <div class="toolbar-title">
            <h1>Artifact Lifecycle</h1>
          </div>
          <div class="toolbar-actions">
            <button
              type="button"
              classList={{
                button: true,
                "toolbar-watcher-btn": true,
                "is-connected": watcherState.status() === "connected",
                "is-reconnecting": watcherState.status() === "reconnecting",
                "is-disconnected": watcherState.status() === "disconnected",
              }}
              onClick={() => setWatcherPanelOpen((value) => !value)}
              aria-label={`Watcher status: ${watcherState.status()}`}
            >
              <span class="watcher-status-dot" />
              <span>Live</span>
              <Show when={watcherState.refreshing()}>
                <span class="watcher-refresh-badge">↻</span>
              </Show>
            </button>
            <Show when={hasTests()}>
              <button
                type="button"
                classList={{
                  button: true,
                  "toolbar-tests-btn": true,
                  "is-active": testsVisible(),
                }}
                role="switch"
                aria-checked={testsVisible()}
                aria-label={`Test overlays ${testsVisible() ? "on" : "off"}`}
                onClick={() => setTestsVisible((value) => !value)}
              >
                <span class="toolbar-tests-dot" data-status={testsData()?.run.status} />
                <span>Tests</span>
              </button>
            </Show>
            <button
              type="button"
              class="button toolbar-search-btn"
              aria-label="Open search"
              onClick={() => setSearchOpenRequest((value) => value + 1)}
            >
              <svg
                class="toolbar-search-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M10.5 4a6.5 6.5 0 1 0 4.03 11.6l4.43 4.44 1.06-1.06-4.44-4.43A6.5 6.5 0 0 0 10.5 4Zm0 1.5a5 5 0 1 1 0 10a5 5 0 0 1 0-10Z"
                />
              </svg>
              <span>Search</span>
            </button>
            <Show when={selectedPromptNodes().length > 0}>
              <button
                type="button"
                classList={{
                  button: true,
                  "toolbar-prompt-btn": true,
                  "is-open": promptDockOpen(),
                }}
                onClick={() => setPromptDockOpen(true)}
              >
                {`Prompt (${selectedPromptNodes().length})`}
              </button>
            </Show>
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
              <GraphSurface
                graphId={
                  searchActive() ? `search:${searchQuery()}` : location().pathname
                }
                graph={activeSearchGraph()}
                elements={searchActive() ? undefined : diagramData()?.elements() || []}
                mermaidText={searchActive() ? undefined : diagramData()?.mermaidText()}
                scenarioData={searchActive() ? undefined : diagramQuery.data?.combined}
                testByEntity={testByEntity()}
                testsVisible={testsVisible()}
                onNodeTap={(nodeId, kind, label) => {
                  if (searchActive()) {
                    navigate({
                      search: (prev: Record<string, unknown>) => ({
                        ...prev,
                        panelKind: kind,
                        panelId: nodeId,
                        panelLabel: label,
                      }),
                    });
                    return;
                  }

                  diagramData()?.onNodeTap(nodeId, kind, label);
                }}
                onNodeInfo={(nodeId, kind, label) => {
                  navigate({
                    search: (prev: Record<string, unknown>) => ({
                      ...prev,
                      panelKind: kind,
                      panelId: nodeId,
                      panelLabel: label,
                    }),
                  });
                }}
                onEdgeTap={
                  searchActive()
                    ? undefined
                    : (edgeId, kind, label) =>
                        diagramData()?.onEdgeTap(edgeId, kind, label)
                }
                onSelectionApi={(api) => setSelectionApi(() => api)}
              />
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
        <PromptDock
          isOpen={promptDockOpen() && selectedPromptNodes().length > 0}
          selection={selectedPromptNodes()}
          onToggleSelection={(nodeId) => selectionApi()?.toggleSelection(nodeId)}
          onClearSelection={() => selectionApi()?.clearSelection()}
          onSubmit={handlePromptSubmit}
          onClose={() => setPromptDockOpen(false)}
        />
      </div>
    </DiagramShellContext.Provider>
  );
};
