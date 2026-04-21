import type { JSX } from "solid-js";
import { Show, For, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { useSearch, useNavigate, useParams } from "@tanstack/solid-router";
import { WATCHER_URL } from "../lib/diagram-data";
import { useDiagramData } from "../lib/diagram-data";
import type { DiagramData, DiagramDetailRecord } from "../lib/diagram-data";
import { createOverlayFocus } from "../lib/a11y/createOverlayFocus";
import { rebaseArticleLinks, resolveLegacyLink } from "../lib/detail-panel-links";
import { getNodeVisualByKind } from "../lib/node-visuals";
import { IconSvg } from "./IconSvg";
import { PanelPrompt } from "./PanelPrompt";

const SKIP_FIELDS = new Set(["kind", "id", "label", "href", "color", "clusterColor"]);
const SUMMARY_ONLY_FIELDS = new Set([
  "description",
  "systemCount",
  "fileCount",
  "agentCount",
]);
const EDGE_METADATA_FIELDS = new Set(["from", "to", "fromLabel", "toLabel"]);
const EDGE_PANEL_KINDS = new Set([
  "store-edge",
  "cluster-edge",
  "system-edge",
  "store-read",
  "store-write",
  "import",
  "file-import",
  "agent-invoke",
  "ui-implements",
  "behavioral-edge",
  "behavioral-back-edge",
  "stage-flow",
  "step-flow",
  "edge",
]);

type CombinedScenario = NonNullable<DiagramData["combined"]>["scenarios"][string];
type ScenarioBeat = CombinedScenario["beats"][number];
type EdgeScenarioRef = {
  scenario: CombinedScenario;
  beats: ScenarioBeat[];
};

type EdgeEndpoint = {
  role: "source" | "target";
  id: string;
  label: string;
  kind?: string;
  iconKind?: string;
  available: boolean;
};

function metadataFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    stageIds: "Stages",
    stepIds: "Steps",
    entryArtifacts: "Entry Artifacts",
    exitArtifacts: "Exit Artifacts",
    inputArtifacts: "Input Artifacts",
    outputArtifacts: "Output Artifacts",
    lifecycleId: "Lifecycle",
    systems: "Systems",
    modules: "Modules",
    agents: "Agents",
    systemCount: "Systems",
    fileCount: "Files",
    agentCount: "Agents",
    path: "Path",
    moduleId: "Module",
    systemId: "System",
    symbols: "Symbols",
    importedBy: "Imported By",
    imports: "Imports",
    mechanism: "Mechanism",
    from: "From",
    to: "To",
    routePath: "Route",
    screenId: "Screen",
    componentType: "Component Type",
    implementationIds: "Implementations",
  };
  return labels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

function renderMetadataValue(value: unknown): JSX.Element {
  if (Array.isArray(value)) {
    if (value.length > 8) {
      return <span>{value.length} items</span>;
    }

    return (
      <ul style={{ margin: 0, padding: "0 0 0 16px", "list-style": "disc" }}>
        <For each={value}>{(item) => <li>{String(item)}</li>}</For>
      </ul>
    );
  }

  return <span>{String(value)}</span>;
}

function clearPanelSearch(prev: Record<string, unknown>) {
  const next = { ...prev };
  delete next.panelKind;
  delete next.panelId;
  delete next.panelLabel;
  return next;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function humanizeMechanism(value: string): string {
  if (!value) return "";
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function resolveEndpointKind(rawKind: string | undefined): string | undefined {
  if (!rawKind) return undefined;
  if (rawKind === "module") return "file";
  return rawKind;
}

export function DetailPanel() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const routeParams = useParams({ strict: false });
  const diagramQuery = useDiagramData();
  const [htmlContent, setHtmlContent] = createSignal("");
  const [focusedBlockId, setFocusedBlockId] = createSignal<string | null>(null);
  let panelRef: HTMLElement | undefined;
  let panelBodyRef: HTMLDivElement | undefined;
  let panelTitleRef: HTMLHeadingElement | undefined;

  const s = () => (search as any)() as Record<string, string | undefined>;
  const isOpen = () => !!s().panelKind && !!s().panelId;
  const panelKind = () => s().panelKind;
  const panelId = () => s().panelId;
  const panelLabel = () => s().panelLabel;

  // Look up the detail record and its href
  const detail = () => {
    const d = diagramQuery.data;
    const id = panelId();
    if (!d || !id) return null;
    const result = d.details[id] ?? null;
    if (!result && id) {
      console.warn(`[DetailPanel] No detail record for panelId="${id}". Available keys sample:`, Object.keys(d.details).filter(k => k.includes(id.split('_')[1] || '')).slice(0, 5));
    }
    return result;
  };

  const isContainer = createMemo(
    () => !!getNodeVisualByKind(panelKind() || "")?.isContainer,
  );

  const panelAccent = createMemo(() => {
    const d = detail();
    if (typeof d?.color === "string" && d.color) return d.color;
    if (typeof d?.clusterColor === "string" && d.clusterColor) return d.clusterColor;
    return "currentColor";
  });

  const description = createMemo(() => {
    const value = detail()?.description;
    return typeof value === "string" ? value : "";
  });

  const codeBlocks = createMemo(() => {
    const d = diagramQuery.data;
    const id = panelId();
    if (!d?.code?.byEntity || !id) return [];
    const blockIds = d.code.byEntity[id] ?? [];
    return blockIds
      .map((blockId) => d.code!.blocks[blockId])
      .filter(Boolean);
  });

  const panelScenarios = createMemo(() => {
    const d = diagramQuery.data;
    const id = panelId();
    if (!d?.combined?.bindings || !id) return [];
    const scenarioIds = d.combined.bindings[id] ?? [];
    return scenarioIds
      .map((scId) => d.combined!.scenarios[scId])
      .filter(Boolean);
  });

  // Walk the loaded data for a graph element whose id matches panelId and
  // whose data.source is set (i.e. it's an edge). Used when details[panelId]
  // is missing, which happens for several generator-synthesized edge kinds.
  // Declared before isEdgePanel because isEdgePanel's memo body references it
  // — Solid's createMemo bodies run lazily on access, but JS const bindings
  // are in TDZ until the declaration line runs.
  const findEdgeElement = createMemo(() => {
    const id = panelId();
    const data = diagramQuery.data;
    if (!id || !data) return null;

    const slices: Array<DiagramData["organizational"]["root"] | undefined> = [];
    slices.push(data.organizational?.root);
    if (data.organizational?.clusters) {
      for (const s of Object.values(data.organizational.clusters)) slices.push(s);
    }
    if (data.organizational?.systems) {
      for (const s of Object.values(data.organizational.systems)) slices.push(s);
    }
    slices.push(data.behavioral?.root);
    if (data.behavioral?.lifecycles) {
      for (const s of Object.values(data.behavioral.lifecycles)) slices.push(s);
    }
    if (data.behavioral?.stages) {
      for (const s of Object.values(data.behavioral.stages)) slices.push(s);
    }
    // Optional UI exploration view if present on the data shape.
    const ui = (data as unknown as { ui?: { root?: { elements: unknown[] } } }).ui;
    if (ui?.root) slices.push(ui.root as DiagramData["organizational"]["root"]);

    for (const slice of slices) {
      if (!slice?.elements) continue;
      for (const el of slice.elements) {
        const d = (el as { data?: Record<string, unknown> }).data;
        if (!d || d.id !== id) continue;
        if (typeof d.source !== "string" || typeof d.target !== "string") continue;
        return d as { id: string; source: string; target: string; kind?: string; label?: string };
      }
    }
    return null;
  });

  const isEdgePanel = createMemo(() => {
    const d = detail();
    if (d) return d.kind === "edge";
    if (EDGE_PANEL_KINDS.has(panelKind() || "")) return true;
    // Some edge kinds the generator synthesizes in graph elements but
    // never writes to details (e.g. behavioral-edge lifecycle transitions
    // `be_lifecycle:X_lifecycle:Y`). Treat those as edges too.
    return !!findEdgeElement();
  });

  const edgeIconKind = createMemo(() => {
    if (!isEdgePanel()) return panelKind() || "";
    return panelKind() || "edge";
  });

  const edgeMechanismLabel = createMemo(() => {
    if (!isEdgePanel()) return "";
    const d = detail();
    const mechanism = stringValue(d?.mechanism);
    if (mechanism) return humanizeMechanism(mechanism);

    const el = findEdgeElement();
    // Element.kind carries the edge semantic kind (e.g. "behavioral-edge",
    // "store-read", "file-import") — use it as the mechanism when details
    // are missing.
    if (el?.kind && el.kind !== "edge" && EDGE_PANEL_KINDS.has(el.kind)) {
      return humanizeMechanism(el.kind);
    }

    const label = panelLabel() || stringValue(d?.label) || el?.label || "";
    const kind = panelKind() || "";
    if (kind === "store-edge" && /^(read|write)$/i.test(label)) {
      return humanizeMechanism(`store-${label}`);
    }
    if (EDGE_PANEL_KINDS.has(kind) && kind !== "edge") {
      return humanizeMechanism(kind);
    }
    return humanizeMechanism(label);
  });

  const edgeEndpoints = createMemo(() => {
    if (!isEdgePanel()) return null;
    const d = detail();
    const details = diagramQuery.data?.details;
    if (!details) return null;

    // Primary: use details record. Fallback: resolve from the graph element
    // (for edges whose details record isn't emitted by the generator — e.g.
    // lifecycle transitions, some cluster edges).
    const el = findEdgeElement();
    const fromId = stringValue(d?.from) || el?.source || "";
    const toId = stringValue(d?.to) || el?.target || "";
    if (!fromId || !toId) return null;

    const buildEndpoint = (
      role: EdgeEndpoint["role"],
      id: string,
      labelField: "fromLabel" | "toLabel",
    ): EdgeEndpoint => {
      const endpointDetail = details[id] as DiagramDetailRecord | undefined;
      const rawKind = stringValue(endpointDetail?.kind);
      const label =
        stringValue(d?.[labelField]) ||
        stringValue(endpointDetail?.label) ||
        id;
      return {
        role,
        id,
        label,
        kind: rawKind || undefined,
        iconKind: resolveEndpointKind(rawKind),
        available: !!endpointDetail,
      };
    };

    return {
      from: buildEndpoint("source", fromId, "fromLabel"),
      to: buildEndpoint("target", toId, "toLabel"),
    };
  });

  const edgeScenarioCitationIndex = createMemo(() => {
    const byEdge = new Map<string, Map<string, EdgeScenarioRef>>();
    const scenarios = diagramQuery.data?.combined?.scenarios;
    if (!scenarios) return byEdge;

    for (const scenario of Object.values(scenarios)) {
      for (const beat of scenario.beats ?? []) {
        for (const edgeId of beat.edgeIds ?? []) {
          let scenarioMap = byEdge.get(edgeId);
          if (!scenarioMap) {
            scenarioMap = new Map<string, EdgeScenarioRef>();
            byEdge.set(edgeId, scenarioMap);
          }

          const existing = scenarioMap.get(scenario.id);
          if (existing) {
            if (!existing.beats.includes(beat)) existing.beats.push(beat);
          } else {
            scenarioMap.set(scenario.id, { scenario, beats: [beat] });
          }
        }
      }
    }

    return byEdge;
  });

  const edgeScenarioRefs = createMemo(() => {
    const id = panelId();
    if (!id) return [] as EdgeScenarioRef[];
    return Array.from(edgeScenarioCitationIndex().get(id)?.values() ?? []);
  });

  const behaviorScenarioRefs = createMemo(() => {
    if (isEdgePanel()) return edgeScenarioRefs();
    return panelScenarios().map((scenario) => ({ scenario, beats: [] }));
  });

  const summaryFields = createMemo(() => {
    const d = detail();
    if (!d) return [] as Array<{ label: string; value: string }>;

    const fields: Array<{ label: string; value: string }> = [];
    const seenLabels = new Set<string>();
    const pushField = (label: string, value: string) => {
      if (seenLabels.has(label)) return;
      seenLabels.add(label);
      fields.push({ label, value });
    };
    const pushCount = (key: string, label: string) => {
      const value = d[key];
      if (typeof value === "number") {
        pushField(label, String(value));
      }
    };
    const pushArrayCount = (key: string, label: string) => {
      const value = d[key];
      if (Array.isArray(value)) {
        pushField(label, String(value.length));
      }
    };
    const pushText = (key: string, label: string) => {
      const value = d[key];
      if (typeof value === "string" && value) {
        pushField(label, value);
      }
    };

    pushCount("systemCount", "Systems");
    pushCount("fileCount", "Files");
    pushCount("agentCount", "Agents");
    pushArrayCount("stageIds", "Stages");
    pushArrayCount("stepIds", "Steps");
    pushArrayCount("systems", "Systems");
    pushArrayCount("modules", "Modules");
    pushArrayCount("agents", "Agents");
    pushText("path", "Path");
    pushText("lifecycleId", "Lifecycle");
    pushText("moduleId", "Module");
    pushText("systemId", "System");

    return fields;
  });

  const fields = createMemo(() => {
    const d = detail();
    if (!d) return [] as Array<[string, unknown]>;
    return Object.entries(d).filter(
      ([key]) =>
        !SKIP_FIELDS.has(key) &&
        !SUMMARY_ONLY_FIELDS.has(key) &&
        !(isEdgePanel() && EDGE_METADATA_FIELDS.has(key)),
    );
  });

  // Fetch page content when panel opens
  createEffect(() => {
    const id = panelId();
    const kind = panelKind();
    if (!id || !kind || !isOpen()) {
      setHtmlContent("");
      return;
    }

    const d = detail();
    const href = d?.href;
    if (!href) {
      setHtmlContent("");
      return;
    }

    const fetchUrl = `${WATCHER_URL}/site/${href}`;
    fetch(fetchUrl)
      .then((res) => (res.ok ? res.text() : ""))
      .then((html) => {
        if (!html) {
          setHtmlContent("");
          return;
        }
        const doc = new DOMParser().parseFromString(html, "text/html");
        const article = doc.querySelector("article");
        if (article) {
          rebaseArticleLinks(article, fetchUrl);
          // Strip elements that don't belong in the side panel
          for (const sel of [
            ".page-title",           // duplicate header (#15)
            "h1",                    // duplicate header fallback
            ".breadcrumb",           // page breadcrumb navigation (#16)
            ".system-diagram-links", // page navigation links (#16)
            ".cy-container",         // empty diagram container (#17)
            ".diagram-shell",        // empty diagram wrapper (#17)
          ]) {
            for (const el of article.querySelectorAll(sel)) el.remove();
          }
          setHtmlContent(article.innerHTML);
          return;
        }
        setHtmlContent("");
      })
      .catch(() => {
        setHtmlContent("");
      });
  });

  const handleClick = (e: MouseEvent) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest("a[href]");
    if (!anchor || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

    if (anchor.hasAttribute("data-open-system-diagram")) {
      e.preventDefault();
      const systemId = anchor.getAttribute("data-system-id");
      const clusterId =
        anchor.getAttribute("data-cluster-id") ||
        diagramQuery.data?.organizational.systems[systemId || ""]?.clusterId ||
        routeParams().clusterId;
      if (systemId && clusterId) {
        navigate({
          to: `/organizational/clusters/${clusterId}/systems/${systemId}`,
          search: clearPanelSearch,
        });
      }
      return;
    }

    const diagramData = diagramQuery.data;
    if (!diagramData) return;

    const action = resolveLegacyLink(href, diagramData, routeParams());
    if (action.type === "route") {
      e.preventDefault();
      navigate({ to: action.to, search: clearPanelSearch });
    } else if (action.type === "panel") {
      e.preventDefault();
      navigate({
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          panelKind: action.panelKind,
          panelId: action.panelId,
          panelLabel: action.panelLabel,
        }),
      });
    }
  };

  const openEndpointPanel = (endpoint: EdgeEndpoint) => {
    if (!endpoint.available || !endpoint.kind) return;
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        panelKind: endpoint.kind,
        panelId: endpoint.id,
        panelLabel: endpoint.label,
      }),
      replace: true,
    });
    queueMicrotask(() => {
      panelTitleRef?.focus();
    });
  };

  createEffect(() => {
    const panelBody = panelBodyRef;
    if (!panelBody) return;

    panelBody.addEventListener("click", handleClick);
    onCleanup(() => {
      panelBody.removeEventListener("click", handleClick);
    });
  });

  createEffect(() => {
    panelId();
    setFocusedBlockId(null);
  });

  const viewDiagram = () => {
    const id = panelId();
    const kind = panelKind();
    const data = diagramQuery.data;
    const currentParams = routeParams();
    if (!id || !kind) return;

    if (kind === "cluster") {
      navigate({
        to: `/organizational/clusters/${id}`,
        search: clearPanelSearch,
      });
      return;
    }

    if (kind === "system") {
      const clusterId = data?.organizational.systems[id]?.clusterId || currentParams.clusterId;
      if (clusterId) {
        navigate({
          to: `/organizational/clusters/${clusterId}/systems/${id}`,
          search: clearPanelSearch,
        });
      }
      return;
    }

    if (kind === "lifecycle") {
      navigate({
        to: `/behavioral/lifecycles/${id}`,
        search: clearPanelSearch,
      });
      return;
    }

    if (kind === "stage") {
      const lifecycleId =
        data?.behavioral.stages[id]?.lifecycleId || currentParams.lifecycleId;
      if (lifecycleId) {
        navigate({
          to: `/behavioral/lifecycles/${lifecycleId}/stages/${id}`,
          search: clearPanelSearch,
        });
      }
      return;
    }

    if (kind === "ui-screen") {
      navigate({
        to: `/ui/screens/${id}`,
        search: clearPanelSearch,
      });
    }
  };

  const close = () => {
    navigate({
      search: clearPanelSearch,
    });
  };

  // URL-persistent inspector: kept as <aside> landmark rather than dialog; no focus trap so users can return to the graph.
  createOverlayFocus({
    isOpen,
    getRoot: () => panelRef,
    getFocusTarget: () => panelTitleRef ?? null,
    onEscape: close,
  });

  return (
    <>
      <div
        classList={{ "detail-scrim": true, "is-visible": isOpen() }}
        aria-hidden="true"
        onClick={close}
      />
      <aside
        id="detail-panel"
        ref={panelRef}
        classList={{ "detail-panel": true, "is-open": isOpen() }}
        aria-hidden={!isOpen()}
        inert={!isOpen()}
      >
        <Show when={isOpen()}>
          <div class="detail-panel-header">
            <div class="detail-panel-header-main">
              <div
                classList={{
                  "detail-panel-icon": true,
                  "detail-panel-icon--edge": isEdgePanel(),
                }}
                style={{ color: panelAccent() }}
              >
                <IconSvg kind={edgeIconKind()} size={28} />
              </div>
              <div class="detail-panel-titleblock">
                <span id="detail-panel-kind" class="eyebrow">
                  {panelKind()}
                </span>
                <h2 id="detail-panel-title" ref={panelTitleRef} tabIndex={-1}>
                  {panelLabel() || detail()?.label || panelId()}
                </h2>
                <Show when={isEdgePanel() && edgeEndpoints()}>
                  {(endpoints) => (
                    <p class="detail-panel-subtitle detail-edge-titlepath">
                      <span>{endpoints().from.label}</span>
                      <span aria-hidden="true"> → </span>
                      <Show when={edgeMechanismLabel()}>
                        {(mechanism) => (
                          <>
                            <span>{mechanism()}</span>
                            <span aria-hidden="true"> → </span>
                          </>
                        )}
                      </Show>
                      <span>{endpoints().to.label}</span>
                    </p>
                  )}
                </Show>
              </div>
            </div>
            <div class="detail-panel-actions">
              <Show when={isContainer()}>
                <button type="button" class="button" onClick={viewDiagram}>
                  View Diagram →
                </button>
              </Show>
              <button
                id="detail-panel-close"
                type="button"
                class="button"
                onClick={close}
                aria-label="Close panel"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  aria-hidden="true"
                  style={{ "flex-shrink": 0 }}
                >
                  <path
                    d="M1 1 L9 9 M9 1 L1 9"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    fill="none"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div
            id="detail-panel-body"
            class="detail-panel-body"
            ref={panelBodyRef}
          >
            <Show when={summaryFields().length}>
              <div class="detail-summary-strip">
                <For each={summaryFields()}>
                  {(field) => (
                    <div class="detail-summary-item">
                      <span class="detail-summary-label">{field.label}</span>
                      <strong class="detail-summary-value">{field.value}</strong>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={edgeEndpoints()}>
              {(endpoints) => (
                <div class="detail-module detail-edge-endpoints" aria-label="Relationship endpoints">
                  <h3 class="detail-edge-endpoints-title">Endpoints</h3>
                  <div class="detail-edge-endpoints-flow">
                    <Show
                      when={endpoints().from.available}
                      fallback={
                        <span
                          class="detail-edge-endpoint detail-edge-endpoint--source is-unavailable"
                          aria-label="Source node details unavailable"
                        >
                          <span class="detail-edge-endpoint-icon" aria-hidden="true" />
                          <span class="detail-edge-endpoint-copy">
                            <span class="detail-edge-endpoint-role">Source</span>
                            <span class="detail-edge-endpoint-label">{endpoints().from.label}</span>
                          </span>
                        </span>
                      }
                    >
                      <button
                        type="button"
                        class="detail-edge-endpoint detail-edge-endpoint--source"
                        aria-label={`Open source node ${endpoints().from.label}`}
                        onClick={() => openEndpointPanel(endpoints().from)}
                      >
                        <span class="detail-edge-endpoint-icon">
                          <Show when={endpoints().from.iconKind}>
                            {(iconKind) => <IconSvg kind={iconKind()} size={18} />}
                          </Show>
                        </span>
                        <span class="detail-edge-endpoint-copy">
                          <span class="detail-edge-endpoint-role">Source</span>
                          <span class="detail-edge-endpoint-label">{endpoints().from.label}</span>
                        </span>
                      </button>
                    </Show>

                    <div class="detail-edge-connector" aria-label={`Relationship: ${edgeMechanismLabel()}`}>
                      <span class="detail-edge-connector-line" aria-hidden="true" />
                      <span class="detail-edge-connector-label">{edgeMechanismLabel()}</span>
                      <span class="detail-edge-connector-arrow" aria-hidden="true">→</span>
                    </div>

                    <Show
                      when={endpoints().to.available}
                      fallback={
                        <span
                          class="detail-edge-endpoint detail-edge-endpoint--target is-unavailable"
                          aria-label="Target node details unavailable"
                        >
                          <span class="detail-edge-endpoint-icon" aria-hidden="true" />
                          <span class="detail-edge-endpoint-copy">
                            <span class="detail-edge-endpoint-role">Target</span>
                            <span class="detail-edge-endpoint-label">{endpoints().to.label}</span>
                          </span>
                        </span>
                      }
                    >
                      <button
                        type="button"
                        class="detail-edge-endpoint detail-edge-endpoint--target"
                        aria-label={`Open target node ${endpoints().to.label}`}
                        onClick={() => openEndpointPanel(endpoints().to)}
                      >
                        <span class="detail-edge-endpoint-icon">
                          <Show when={endpoints().to.iconKind}>
                            {(iconKind) => <IconSvg kind={iconKind()} size={18} />}
                          </Show>
                        </span>
                        <span class="detail-edge-endpoint-copy">
                          <span class="detail-edge-endpoint-role">Target</span>
                          <span class="detail-edge-endpoint-label">{endpoints().to.label}</span>
                        </span>
                      </button>
                    </Show>
                  </div>
                </div>
              )}
            </Show>
            <PanelPrompt
              entityId={panelId() || ""}
              entityKind={panelKind() || ""}
              entityLabel={panelLabel() || detail()?.label || ""}
              description={description()}
              codeBlocks={codeBlocks()}
              scenarios={panelScenarios().map((scenario) => ({
                behaviorId: scenario.behaviorId,
                title: scenario.title,
              }))}
              focusedBlockId={focusedBlockId()}
              onClearFocus={() => setFocusedBlockId(null)}
              accent={panelAccent()}
            />
            <Show when={behaviorScenarioRefs().length > 0}>
              <div class="detail-module detail-behaviors">
                <h3 class="detail-behaviors-title">
                  {isEdgePanel() ? "Referenced by" : "Behaviors"}
                </h3>
                <For each={behaviorScenarioRefs()}>
                  {(scenarioRef) => (
                    <div class="detail-behavior-item">
                      <span class="detail-behavior-label">{scenarioRef.scenario.title}</span>
                      <button
                        type="button"
                        class="detail-behavior-play"
                        data-scenario-id={scenarioRef.scenario.behaviorId}
                        title={`Play: ${scenarioRef.scenario.title}`}
                        onClick={() => {
                          // Close panel first, then start playback
                          navigate({ search: clearPanelSearch });
                          window.dispatchEvent(new CustomEvent("play-scenario", {
                            detail: { behaviorId: scenarioRef.scenario.behaviorId },
                          }));
                        }}
                      >
                        {"\u25B6"} Play
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={description()}>
              <div class="detail-module">
                <p>{description()}</p>
              </div>
            </Show>
            <Show when={codeBlocks().length > 0}>
              <div class="detail-module detail-code">
                <h3 class="detail-code-title">Code</h3>
                <For each={codeBlocks()}>
                  {(block) => (
                    <div class="detail-code-block">
                      <div class="detail-code-header">
                        <span class="detail-code-path">{block.path}</span>
                        <Show when={block.symbol}>
                          <span class="detail-code-symbol">{block.symbol}</span>
                        </Show>
                        <Show when={block.lineStart && block.lineEnd}>
                          <span class="detail-code-lines">L{block.lineStart}–{block.lineEnd}</span>
                        </Show>
                        <button
                          type="button"
                          class="detail-code-use-btn"
                          onClick={() => setFocusedBlockId(block.id)}
                          aria-pressed={focusedBlockId() === block.id}
                        >
                          Use in Prompt
                        </button>
                      </div>
                      <pre class="detail-code-pre"><code>{block.content || "(code not available)"}</code></pre>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={htmlContent()}>
              <div
                class="detail-page"
                data-entity-kind={panelKind()}
                data-entity-id={panelId()}
                innerHTML={htmlContent()}
              />
            </Show>
            <Show when={!htmlContent() && fields().length}>
              <div class="detail-module">
                <table class="table" style={{ "font-size": "0.88rem" }}>
                  <tbody>
                    <For each={fields()}>
                      {([key, value]) => (
                        <tr>
                          <td
                            style={{
                              padding: "6px 12px 6px 0",
                              color: "var(--text-dim, #8b949e)",
                              "vertical-align": "top",
                              "white-space": "nowrap",
                              "font-weight": "500",
                            }}
                          >
                            {metadataFieldLabel(key)}
                          </td>
                          <td style={{ padding: "6px 0", color: "var(--text-secondary, #c9d1d9)" }}>
                            {renderMetadataValue(value)}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
            <Show when={!htmlContent() && !fields().length && !description() && !codeBlocks().length && !edgeEndpoints() && behaviorScenarioRefs().length === 0}>
              <div class="detail-module">
                <p style={{ color: "var(--text-dim)" }}>No details available.</p>
              </div>
            </Show>
          </div>
        </Show>
      </aside>
    </>
  );
}
