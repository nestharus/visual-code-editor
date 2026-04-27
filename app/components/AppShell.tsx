import { useNavigate, useLocation, Link } from "@tanstack/solid-router";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  useContext,
  type ParentComponent,
} from "solid-js";
import { DetailPanel } from "./DetailPanel";
import { DigestPanel, type DigestDisposition } from "./digest-panel/DigestPanel";
import { SearchOverlay } from "./SearchOverlay";
import { SlicePanel } from "./slice-panel/SlicePanel";
import { TasksPanel } from "./tasks-panel/TasksPanel";
import { WatcherPanel } from "./WatcherPanel";
import { WidgetInventoryPanel } from "./widget-inventory/WidgetInventoryPanel";
import {
  FloatingComposer,
  type ComposerMode,
  type ComposerResult,
  type ComposerSubmission,
} from "./floating-composer/FloatingComposer";
import { buildDiffStatusMap } from "../graph/diff-overlay";
import type { CombinedData } from "../graph/BehaviorPlayback";
import { GraphSurface, type GraphSelectionApi } from "../graph/GraphSurface";
import type { GraphDefinition } from "../graph/layout/types";
import type { DiagramElementDefinition } from "../lib/diagram-elements";
import {
  buildDirectTaskDispatchBody,
  ComposerContext,
  type ComposerOpenDirectIntent,
  type ComposerOpenIntent,
} from "../lib/composer-context";
import { createOverlayFocus } from "../lib/a11y/createOverlayFocus";
import {
  useWatchSubscription,
  type WatcherState,
} from "../lib/live/useWatchSubscription";
import { useDiagramData, WATCHER_URL } from "../lib/diagram-data";
import {
  makeSelectionItem,
  makeSelectionScope,
  type AnchorKind,
  type SelectionScope,
} from "../lib/anchor";
import { createSelectionStore } from "../lib/selection-store";
import { createSlicesStore } from "../lib/slices-store";
import type { NeighbourhoodRule, SliceLifecycleState } from "../lib/slice";
import type { Task, TaskState } from "../lib/task";
import type { ChangeEvent } from "../lib/user-context";
import type { Widget } from "../lib/widget";

type DiagramShellData = {
  elements: () => DiagramElementDefinition[];
  mermaidText: () => string | undefined;
  onNodeTap: (nodeId: string, kind: string, label: string) => void;
  onEdgeTap: (edgeId: string, kind: string, label: string) => void;
};

const DIGEST_USER_CONTEXT_ID = "user-context:browser";

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
  const navigate = useNavigate() as (options: unknown) => void;
  const location = useLocation();
  // Memoize pathname so downstream consumers (notably GraphSurface via
  // <GraphSurface graphId=... />) don't re-invalidate when only search
  // params change (panel open/close only mutate search). Without this,
  // every panel toggle re-runs GraphSurface's build effect and replays
  // the enter animation for every node on the unchanged diagram.
  const pathname = createMemo(() => location().pathname);
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
  const selectionStore = createSelectionStore();
  const [composerOpen, setComposerOpen] = createSignal(false);
  const [composerSurfaceAnchor, setComposerSurfaceAnchor] =
    createSignal<AnchorKind>("selection-box");
  const [composerAnchorRect, setComposerAnchorRect] =
    createSignal<DOMRectReadOnly | null>(null);
  const [composerInitialMode, setComposerInitialMode] =
    createSignal<ComposerMode | undefined>(undefined);
  const [composerInitialPrompt, setComposerInitialPrompt] = createSignal("");
  const [composerOpenRequestId, setComposerOpenRequestId] = createSignal(0);
  const [composerResult, setComposerResult] = createSignal<ComposerResult | null>(null);
  const [composerError, setComposerError] = createSignal("");
  const [composerSubmitting, setComposerSubmitting] = createSignal(false);
  const [tasks, setTasks] = createSignal<Task[]>([]);
  const [tasksOpen, setTasksOpen] = createSignal(false);
  const [widgets, setWidgets] = createSignal<Widget[]>([]);
  const [widgetsOpen, setWidgetsOpen] = createSignal(false);
  const [digestEvents, setDigestEvents] = createSignal<ChangeEvent[]>([]);
  const [digestOpen, setDigestOpen] = createSignal(false);
  const slicesStore = createSlicesStore();
  const [slicesOpen, setSlicesOpen] = createSignal(false);
  const [testsVisible, setTestsVisible] = createSignal(initialTestsVisible());
  const [diffVisible, setDiffVisible] = createSignal(initialDiffVisible());
  let viewportRef: HTMLElement | undefined;
  let tasksOverlayRef: HTMLDivElement | undefined;
  let tasksButtonRef: HTMLButtonElement | undefined;
  let widgetsOverlayRef: HTMLDivElement | undefined;
  let widgetsButtonRef: HTMLButtonElement | undefined;
  let digestOverlayRef: HTMLDivElement | undefined;
  let digestButtonRef: HTMLButtonElement | undefined;
  let slicesOverlayRef: HTMLDivElement | undefined;
  let slicesButtonRef: HTMLButtonElement | undefined;
  let composerAnchorElement: HTMLElement | null = null;
  let searchRequestVersion = 0;
  const terminalTaskStates: ReadonlySet<TaskState> = new Set([
    "merged",
    "abandoned",
    "failed",
  ]);

  function initialTestsVisible(): boolean {
    if (typeof window === "undefined") return true;
    const stored = window.sessionStorage?.getItem("testsVisible");
    if (stored === "false") return false;
    return true;
  }

  function initialDiffVisible(): boolean {
    if (typeof window === "undefined") return false;
    return window.sessionStorage?.getItem("diffVisible") === "true";
  }

  const publish = (data: DiagramShellData) => {
    setDiagramData(() => data);
  };

  const activeView = createMemo(() => {
    const path = location().pathname;
    if (path.startsWith("/organizational")) return "organizational";
    if (path.startsWith("/ui")) return "ui";
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
      return parts;
    }

    if (path.startsWith("/ui")) {
      parts.push({ label: "UI Exploration", href: "/ui" });
      const screenMatch = path.match(/\/screens\/([^/]+)/);
      if (screenMatch) {
        const screenId = decodeURIComponent(screenMatch[1]);
        parts.push({
          label: data?.ui?.screens[screenId]?.label || screenId,
        });
      }
      return parts;
    }

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
  const graphSelectionScope = createMemo<SelectionScope>(() =>
    makeSelectionScope(
      selectedPromptNodes().map((node) => makeSelectionItem(node.id, "node", "entity")),
    ),
  );
  const testsData = createMemo(() => diagramQuery.data?.tests ?? null);
  const testByEntity = createMemo(() => testsData()?.byEntity ?? {});
  const hasTests = createMemo(() => Object.keys(testByEntity()).length > 0);
  const diffsData = createMemo(() => diagramQuery.data?.diffs ?? null);
  const currentDiff = createMemo(() => {
    const diffs = diffsData();
    if (!diffs) return null;
    return diffs.byId[diffs.defaultDiffId] ?? null;
  });
  const diffStatusMap = createMemo(() => buildDiffStatusMap(currentDiff()));
  const hasDiff = createMemo(() => !!currentDiff());
  const activeTaskCount = createMemo(
    () => tasks().filter((task) => !terminalTaskStates.has(task.state)).length,
  );
  const widgetCount = createMemo(() => widgets().length);
  const immediateDigestCount = createMemo(
    () => digestEvents().filter((event) => event.tier === "immediate").length,
  );
  const activeSliceCount = createMemo(
    () =>
      slicesStore
        .slices()
        .filter((slice) => slice.lifecycleState !== "dismissed").length,
  );

  async function fetchTasks() {
    try {
      const response = await fetch(`${WATCHER_URL}/api/tasks`);
      if (!response.ok) return;

      const data = await response.json();
      const nextTasks = Array.isArray(data) ? data : data?.tasks;
      setTasks(Array.isArray(nextTasks) ? nextTasks : []);
    } catch {
      // Task data is an enhancement to the toolbar; keep the shell usable if it is unavailable.
    }
  }

  async function fetchWidgets(refresh = false) {
    try {
      const response = await fetch(
        `${WATCHER_URL}/api/widgets${refresh ? "?refresh=true" : ""}`,
      );
      if (!response.ok) return;

      const data = await response.json();
      const nextWidgets = Array.isArray(data) ? data : data?.widgets;
      setWidgets(Array.isArray(nextWidgets) ? nextWidgets : []);
    } catch {
      // Widget inventory is an enhancement to the toolbar; keep the shell usable if it is unavailable.
    }
  }

  async function fetchDigestEvents(includeSuppressed = false) {
    try {
      const response = await fetch(
        `${WATCHER_URL}/api/change-events?user_context_id=${encodeURIComponent(
          DIGEST_USER_CONTEXT_ID,
        )}&include_suppressed=${includeSuppressed ? "true" : "false"}`,
      );
      if (!response.ok) return;

      const data = await response.json();
      const nextEvents = Array.isArray(data) ? data : data?.events;
      setDigestEvents(Array.isArray(nextEvents) ? nextEvents : []);
    } catch {
      // Digest data is an enhancement to the toolbar; keep the shell usable if it is unavailable.
    }
  }

  async function transitionTask(taskId: string, toState: TaskState, reason: string) {
    try {
      const response = await fetch(
        `${WATCHER_URL}/api/tasks/${encodeURIComponent(taskId)}/transition`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to_state: toState, reason }),
        },
      );

      if (response.ok) {
        await fetchTasks();
      }
    } catch {
      // v1 leaves transition failures silent; the next explicit open will refetch state.
    }
  }

  function openTask(taskId: string) {
    console.log("Open task", taskId);
  }

  function openWidget(widget: Widget) {
    console.log("Open widget", widget.id);
  }

  async function disposeDigestEvent(
    eventId: string,
    disposition: DigestDisposition,
  ): Promise<void> {
    try {
      const response = await fetch(
        `${WATCHER_URL}/api/change-events/${encodeURIComponent(eventId)}/dispose`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            disposition,
            user_context_id: DIGEST_USER_CONTEXT_ID,
          }),
        },
      );

      if (response.ok) {
        if (disposition === "disposed_to_immediate") {
          setDigestEvents((current) =>
            current.map((event) =>
              event.id === eventId ? { ...event, tier: "immediate" } : event,
            ),
          );
        } else {
          setDigestEvents((current) =>
            current.filter((event) => event.id !== eventId),
          );
        }
      }
    } catch {
      // v1 leaves dispose failures silent; the next refresh will reconcile state.
    }
  }

  function openDigestEvent(event: ChangeEvent) {
    if (event.detailUrl) {
      window.open(event.detailUrl, "_blank", "noopener");
    }
  }

  function resolveSliceEntityLabel(entityId: string): string | null {
    const details = diagramQuery.data?.details?.[entityId];
    return typeof details?.label === "string" ? details.label : null;
  }

  function openSliceEntity(entityId: string) {
    console.log("Open slice entity", entityId);
  }

  function closeComposer() {
    setComposerOpen(false);
    setComposerAnchorRect(null);
    setComposerResult(null);
    setComposerError("");
    setComposerSubmitting(false);
    setComposerInitialMode(undefined);
    setComposerInitialPrompt("");
    composerAnchorElement = null;
  }

  function updateComposerAnchorRect() {
    if (!composerOpen()) return;
    if (composerAnchorElement?.isConnected) {
      setComposerAnchorRect(composerAnchorElement.getBoundingClientRect());
    }
  }

  function openComposer(intent: ComposerOpenIntent) {
    if (intent.selection) {
      selectionStore.replace(intent.selection.items);
    }

    composerAnchorElement = intent.trigger ?? null;
    setComposerInitialMode(undefined);
    setComposerInitialPrompt("");
    setComposerSurfaceAnchor(intent.surfaceAnchor);
    setComposerAnchorRect(
      intent.anchorRect ??
        intent.trigger?.getBoundingClientRect() ??
        viewportRef?.getBoundingClientRect() ??
        null,
    );
    setComposerResult(null);
    setComposerError("");
    setComposerSubmitting(false);
    setComposerOpenRequestId((value) => value + 1);
    setComposerOpen(true);
  }

  function openDirectComposer(intent: ComposerOpenDirectIntent) {
    selectionStore.replace(
      intent.behaviourId
        ? [makeSelectionItem(intent.behaviourId, "behaviour-card", "entity")]
        : [],
    );

    composerAnchorElement = null;
    setComposerInitialMode("direct");
    setComposerInitialPrompt(intent.prompt);
    setComposerSurfaceAnchor(intent.surfaceAnchor);
    setComposerAnchorRect(viewportRef?.getBoundingClientRect() ?? null);
    setComposerResult(null);
    setComposerError("");
    setComposerSubmitting(false);
    setComposerOpenRequestId((value) => value + 1);
    setComposerOpen(true);
  }

  function isTextEntryElement(element: Element | null): boolean {
    if (!(element instanceof HTMLElement)) return false;
    const tagName = element.tagName.toLowerCase();
    return (
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      element.isContentEditable
    );
  }

  function resultText(data: unknown): string {
    if (!data || typeof data !== "object") return "";
    const record = data as Record<string, unknown>;
    if (typeof record.response === "string") return record.response;
    if (typeof record.output === "string") return record.output.trim();
    const parsed = record.parsed;
    if (parsed && typeof parsed === "object") {
      const parsedRecord = parsed as Record<string, unknown>;
      if (typeof parsedRecord.response === "string") return parsedRecord.response;
      if (typeof parsedRecord.message === "string") return parsedRecord.message;
    }
    return "";
  }

  function patchText(data: unknown): string {
    if (!data || typeof data !== "object") return "";
    const record = data as Record<string, unknown>;
    if (typeof record.patch === "string") return record.patch;
    const parsed = record.parsed;
    if (parsed && typeof parsed === "object") {
      const parsedRecord = parsed as Record<string, unknown>;
      if (typeof parsedRecord.patch === "string") return parsedRecord.patch;
    }
    return "";
  }

  async function handleComposerSubmit(payload: ComposerSubmission) {
    setComposerSubmitting(true);
    setComposerError("");
    setComposerResult(null);

    try {
      if (payload.mode === "direct") {
        const response = await fetch(`${WATCHER_URL}/api/tasks/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildDirectTaskDispatchBody(payload)),
        });

        if (!response.ok) {
          throw new Error("Task dispatch request failed");
        }

        const data = await response.json();
        await fetchTasks();
        const dispatchedLabel =
          typeof data?.task?.label === "string"
            ? data.task.label
            : payload.prompt.slice(0, 80);
        setComposerResult({ kind: "direct", text: dispatchedLabel });
        return;
      }

      const response = await fetch(`${WATCHER_URL}/api/prompt-composer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Prompt composer request failed");
      }

      const data = await response.json();
      const text = resultText(data) || "Composer response received.";
      if (payload.mode === "edit") {
        setComposerResult({
          kind: "edit",
          text,
          patch: patchText(data) || text,
        });
      } else {
        setComposerResult({ kind: "answer", text });
      }
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "Prompt composer request failed";
      setComposerError(message);
    } finally {
      setComposerSubmitting(false);
    }
  }

  async function handleConstructSlice(
    query: string,
    rule: NeighbourhoodRule,
  ): Promise<"constructed" | "no-matches"> {
    const slice = await slicesStore.construct(query, rule);
    if (!slice) {
      return "no-matches";
    }

    handleClearSearch();
    setSlicesOpen(true);
    return "constructed";
  }

  createEffect(() => {
    location().pathname;
    selectionApi()?.clearSelection();
    selectionStore.clear();
    closeComposer();
  });

  createEffect(() => {
    selectionStore.replace(graphSelectionScope().items);
  });

  createEffect(() => {
    if (!composerOpen()) return;

    const handleResize = () => updateComposerAnchorRect();
    window.addEventListener("resize", handleResize);
    onCleanup(() => window.removeEventListener("resize", handleResize));
  });

  createOverlayFocus({
    isOpen: tasksOpen,
    getRoot: () => tasksOverlayRef,
    getFocusTarget: () => tasksOverlayRef ?? null,
    trapFocus: true,
    onEscape: () => setTasksOpen(false),
  });

  createOverlayFocus({
    isOpen: widgetsOpen,
    getRoot: () => widgetsOverlayRef,
    getFocusTarget: () => widgetsOverlayRef ?? null,
    trapFocus: true,
    onEscape: () => setWidgetsOpen(false),
  });

  createOverlayFocus({
    isOpen: digestOpen,
    getRoot: () => digestOverlayRef,
    getFocusTarget: () => digestOverlayRef ?? null,
    trapFocus: true,
    onEscape: () => setDigestOpen(false),
  });

  createOverlayFocus({
    isOpen: slicesOpen,
    getRoot: () => slicesOverlayRef,
    getFocusTarget: () => slicesOverlayRef ?? null,
    trapFocus: true,
    onEscape: () => setSlicesOpen(false),
  });

  createEffect(() => {
    if (tasksOpen()) {
      void fetchTasks();
    }
  });

  createEffect(() => {
    if (widgetsOpen()) {
      void fetchWidgets();
    }
  });

  createEffect(() => {
    if (digestOpen()) {
      void fetchDigestEvents(true);
    }
  });

  createEffect(() => {
    if (slicesOpen()) {
      void slicesStore.refresh();
    }
  });

  createEffect(() => {
    if (!tasksOpen()) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (tasksOverlayRef?.contains(target)) return;
      if (tasksButtonRef?.contains(target)) return;
      setTasksOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    onCleanup(() => document.removeEventListener("pointerdown", handlePointerDown));
  });

  createEffect(() => {
    if (!widgetsOpen()) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (widgetsOverlayRef?.contains(target)) return;
      if (widgetsButtonRef?.contains(target)) return;
      setWidgetsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    onCleanup(() => document.removeEventListener("pointerdown", handlePointerDown));
  });

  createEffect(() => {
    if (!digestOpen()) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (digestOverlayRef?.contains(target)) return;
      if (digestButtonRef?.contains(target)) return;
      setDigestOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    onCleanup(() => document.removeEventListener("pointerdown", handlePointerDown));
  });

  createEffect(() => {
    if (!slicesOpen()) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (slicesOverlayRef?.contains(target)) return;
      if (slicesButtonRef?.contains(target)) return;
      setSlicesOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    onCleanup(() => document.removeEventListener("pointerdown", handlePointerDown));
  });

  onMount(() => {
    void fetchTasks();
    void fetchWidgets();
    void fetchDigestEvents();
    void slicesStore.refresh();
  });

  createEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "/" || composerOpen()) return;
      if (isTextEntryElement(document.activeElement)) return;

      event.preventDefault();
      const selection = selectionStore.selection();
      openComposer({
        surfaceAnchor: "selection-box",
        selection,
        trigger:
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : viewportRef,
        anchorRect: viewportRef?.getBoundingClientRect(),
      });
    };

    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
  });

  createEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage?.setItem("testsVisible", testsVisible() ? "true" : "false");
  });

  createEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage?.setItem("diffVisible", diffVisible() ? "true" : "false");
  });

  const handleSkipToDiagram = (event: MouseEvent) => {
    if (!viewportRef) return;
    event.preventDefault();
    viewportRef.focus();
  };

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

  return (
    <DiagramShellContext.Provider value={{ publish }}>
      <ComposerContext.Provider
        value={{
          open: openComposer,
          openDirect: openDirectComposer,
          close: closeComposer,
          selection: selectionStore.selection,
        }}
      >
      <div
        class="page-shell"
      >
        <a
          href="#diagram-viewport"
          class="skip-link"
          onClick={handleSkipToDiagram}
        >
          Skip to main content
        </a>
        <SearchOverlay
          onSearch={handleSearch}
          onClear={handleClearSearch}
          onConstructSlice={handleConstructSlice}
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
                "toolbar-button": true,
                "is-connected": watcherState.status() === "connected",
                "is-reconnecting": watcherState.status() === "reconnecting",
                "is-disconnected": watcherState.status() === "disconnected",
              }}
              data-toolbar="watcher"
              onClick={() => setWatcherPanelOpen((value) => !value)}
              aria-label={`Watcher status: ${watcherState.status()}`}
              aria-expanded={watcherPanelOpen()}
              aria-controls="watcher-panel"
            >
              <span class="watcher-status-dot" aria-hidden="true" />
              <span>Live</span>
              <Show when={watcherState.refreshing()}>
                <span class="watcher-refresh-badge">↻</span>
              </Show>
            </button>
            <Show when={hasTests()}>
              <button
                type="button"
                classList={{
                  "toolbar-button": true,
                }}
                data-toolbar="tests"
                role="switch"
                aria-checked={testsVisible()}
                aria-label={`Test overlays ${testsVisible() ? "on" : "off"}`}
                onClick={() => setTestsVisible((value) => !value)}
              >
                <span class="toolbar-tests-dot" data-status={testsData()?.run.status} />
                <span>Tests</span>
              </button>
            </Show>
            <Show when={hasDiff()}>
              <button
                type="button"
                classList={{
                  "toolbar-button": true,
                }}
                data-toolbar="diff"
                role="switch"
                aria-checked={diffVisible()}
                aria-label={`Diff overlay ${diffVisible() ? "on" : "off"}`}
                title={currentDiff()?.title || "Diff"}
                onClick={() => setDiffVisible((value) => !value)}
              >
                <span class="toolbar-diff-glyph">{"\u00B1"}</span>
                <span>Diff</span>
              </button>
            </Show>
            <button
              type="button"
              class="toolbar-button"
              data-toolbar="search"
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
            <button
              ref={tasksButtonRef}
              type="button"
              class="toolbar-button"
              data-toolbar="tasks"
              data-testid="tasks-toolbar-button"
              aria-label="Open Tasks panel"
              aria-expanded={tasksOpen()}
              aria-controls="tasks-panel-overlay"
              onClick={() => setTasksOpen((value) => !value)}
            >
              {`Tasks (${activeTaskCount()})`}
            </button>
            <button
              ref={widgetsButtonRef}
              type="button"
              class="toolbar-button"
              data-toolbar="widgets"
              data-testid="widgets-toolbar-button"
              aria-label="Open Widgets panel"
              aria-expanded={widgetsOpen()}
              aria-controls="widgets-panel-overlay"
              onClick={() => setWidgetsOpen((value) => !value)}
            >
              {`Widgets (${widgetCount()})`}
            </button>
            <button
              ref={slicesButtonRef}
              type="button"
              class="toolbar-button"
              data-toolbar="slices"
              data-testid="slices-toolbar-button"
              aria-label="Open Slices panel"
              aria-expanded={slicesOpen()}
              aria-controls="slices-panel-overlay"
              onClick={() => setSlicesOpen((value) => !value)}
            >
              {`Slices (${activeSliceCount()})`}
            </button>
            <button
              ref={digestButtonRef}
              type="button"
              class="toolbar-button"
              data-toolbar="digest"
              data-testid="digest-toolbar-button"
              aria-label="Open Digest panel"
              aria-expanded={digestOpen()}
              aria-controls="digest-panel-overlay"
              onClick={() => setDigestOpen((value) => !value)}
            >
              {`Digest (${immediateDigestCount()})`}
            </button>
            <Show when={selectionStore.selection().items.length > 0}>
              <button
                type="button"
                class="toolbar-button"
                data-toolbar="prompt"
                onClick={(event) =>
                  openComposer({
                    surfaceAnchor: "selection-box",
                    trigger: event.currentTarget,
                  })
                }
                aria-expanded={composerOpen()}
              >
                {`Prompt (${selectionStore.selection().items.length})`}
              </button>
            </Show>
            <div class="view-toggle" role="tablist" aria-label="Diagram view">
              <button
                type="button"
                role="tab"
                classList={{
                  "toolbar-button": true,
                  "view-toggle-btn": true,
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
                  "toolbar-button": true,
                  "view-toggle-btn": true,
                }}
                aria-selected={activeView() === "organizational"}
                onClick={() => navigate({ to: "/organizational" })}
                data-view-toggle="organizational"
              >
                Organizational
              </button>
              <button
                type="button"
                role="tab"
                classList={{
                  "toolbar-button": true,
                  "view-toggle-btn": true,
                }}
                aria-selected={activeView() === "ui"}
                onClick={() => navigate({ to: "/ui" })}
                data-view-toggle="ui"
              >
                UI
              </button>
            </div>
          </div>
        </header>

        <nav id="breadcrumb" class="breadcrumb-bar" aria-label="Breadcrumb">
          {breadcrumbs().map((crumb, i) => (
            <>
              {i > 0 && <span class="breadcrumb-sep">/</span>}
              {crumb.href && i < breadcrumbs().length - 1 ? (
                <Link to={crumb.href} class="breadcrumb-item">
                  {crumb.label}
                </Link>
              ) : (
                <span class="breadcrumb-current">{crumb.label}</span>
              )}
            </>
          ))}
        </nav>

        <div class="diagram-and-panel">
          <main
            id="diagram-viewport"
            ref={viewportRef}
            tabIndex={-1}
            aria-label="Diagram"
            style={{ position: "relative" }}
          >
            <div style={{ position: "relative" }}>
              <GraphSurface
                graphId={
                  searchActive() ? `search:${searchQuery()}` : pathname()
                }
                graph={activeSearchGraph()}
                elements={searchActive() ? undefined : diagramData()?.elements() || []}
                mermaidText={searchActive() ? undefined : diagramData()?.mermaidText()}
                scenarioData={
                  searchActive()
                    ? undefined
                    : (diagramQuery.data?.combined as CombinedData | undefined)
                }
                testByEntity={testByEntity()}
                testsVisible={testsVisible()}
                diffStatusMap={diffStatusMap()}
                diffVisible={diffVisible()}
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
        <FloatingComposer
          open={composerOpen()}
          anchorRect={composerAnchorRect()}
          surfaceAnchor={composerSurfaceAnchor()}
          selection={selectionStore.selection()}
          onClose={closeComposer}
          onSubmit={handleComposerSubmit}
          initialMode={composerInitialMode()}
          initialPrompt={composerInitialPrompt()}
          openRequestId={composerOpenRequestId()}
          result={composerResult()}
          error={composerError()}
          isSubmitting={composerSubmitting()}
        />
        <Show when={tasksOpen()}>
          <div
            id="tasks-panel-overlay"
            ref={tasksOverlayRef}
            class="tasks-panel-overlay"
            data-testid="tasks-panel-overlay"
            role="dialog"
            aria-label="Tasks"
            tabIndex={-1}
          >
            <TasksPanel
              tasks={tasks()}
              onTransition={(taskId, toState, reason) => {
                void transitionTask(taskId, toState, reason);
              }}
              onOpenTask={openTask}
            />
          </div>
        </Show>
        <Show when={widgetsOpen()}>
          <div
            id="widgets-panel-overlay"
            ref={widgetsOverlayRef}
            class="widgets-panel-overlay"
            data-testid="widgets-panel-overlay"
            role="dialog"
            aria-label="Widgets"
            tabIndex={-1}
          >
            <WidgetInventoryPanel
              widgets={widgets()}
              onWidgetClick={openWidget}
              onRefresh={() => {
                void fetchWidgets(true);
              }}
            />
          </div>
        </Show>
        <Show when={digestOpen()}>
          <div
            id="digest-panel-overlay"
            ref={digestOverlayRef}
            class="digest-panel-overlay"
            data-testid="digest-panel-overlay"
            role="dialog"
            aria-label="Digest"
            tabIndex={-1}
          >
            <DigestPanel
              events={digestEvents()}
              onEventClick={openDigestEvent}
              onDispose={(eventId, disposition) => {
                void disposeDigestEvent(eventId, disposition);
              }}
            />
          </div>
        </Show>
        <Show when={slicesOpen()}>
          <div
            id="slices-panel-overlay"
            ref={slicesOverlayRef}
            class="slices-panel-overlay"
            data-testid="slices-panel-overlay"
            role="dialog"
            aria-label="Slices"
            tabIndex={-1}
          >
            <div class="slices-panel-shell">
              <header class="slices-panel-header">
                <h2>Slices</h2>
              </header>
              <Show
                when={activeSliceCount() > 0}
                fallback={
                  <p class="slices-panel-empty">No slices constructed yet.</p>
                }
              >
                <div class="slices-panel-list">
                  <For
                    each={slicesStore
                      .slices()
                      .filter((slice) => slice.lifecycleState !== "dismissed")}
                  >
                    {(slice) => (
                      <SlicePanel
                        slice={slice}
                        resolveLabel={resolveSliceEntityLabel}
                        onEntityClick={(entityId) => openSliceEntity(entityId)}
                        onTransition={(toState: SliceLifecycleState) => {
                          void slicesStore.transition(slice.id, toState);
                        }}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </div>
      </ComposerContext.Provider>
    </DiagramShellContext.Provider>
  );
};
