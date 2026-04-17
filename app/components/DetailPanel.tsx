import type { JSX } from "solid-js";
import { Show, For, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { useSearch, useNavigate, useParams } from "@tanstack/solid-router";
import { WATCHER_URL } from "../lib/diagram-data";
import { useDiagramData } from "../lib/diagram-data";
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
      ([key]) => !SKIP_FIELDS.has(key) && !SUMMARY_ONLY_FIELDS.has(key),
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
      >
        <Show when={isOpen()}>
          <div class="detail-panel-header">
            <div class="detail-panel-header-main">
              <div class="detail-panel-icon" style={{ color: panelAccent() }}>
                <IconSvg kind={panelKind() || ""} size={28} />
              </div>
              <div class="detail-panel-titleblock">
                <span id="detail-panel-kind" class="eyebrow">
                  {panelKind()}
                </span>
                <h2 id="detail-panel-title" ref={panelTitleRef} tabIndex={-1}>
                  {panelLabel() || detail()?.label || panelId()}
                </h2>
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
                ✕
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
            <Show when={panelScenarios().length > 0}>
              <div class="detail-module detail-behaviors">
                <h3 class="detail-behaviors-title">Behaviors</h3>
                <For each={panelScenarios()}>
                  {(scenario) => (
                    <div class="detail-behavior-item">
                      <span class="detail-behavior-label">{scenario.title}</span>
                      <button
                        type="button"
                        class="detail-behavior-play"
                        title={`Play: ${scenario.title}`}
                        onClick={() => {
                          // Close panel first, then start playback
                          navigate({ search: clearPanelSearch });
                          window.dispatchEvent(new CustomEvent("play-scenario", {
                            detail: { behaviorId: scenario.behaviorId },
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
            <Show when={!htmlContent() && !fields().length && !description() && !codeBlocks().length}>
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
