import { Show, For, createEffect, createSignal } from "solid-js";
import { useSearch, useNavigate } from "@tanstack/solid-router";
import { WATCHER_URL, useDiagramData } from "../lib/diagram-data";

export function DetailPanel() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const [htmlContent, setHtmlContent] = createSignal("");
  const data = useDiagramData();

  const s = () => (search as any)() as Record<string, string | undefined>;
  const isOpen = () => !!s().panelKind && !!s().panelId;
  const panelKind = () => s().panelKind;
  const panelId = () => s().panelId;
  const panelLabel = () => s().panelLabel;

  // Look up the detail record and its href
  const detail = () => {
    const d = data.data;
    const id = panelId();
    if (!d || !id) return null;
    return d.details[id] ?? null;
  };

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

    const url = `${WATCHER_URL}/site/${href}`;
    fetch(url)
      .then((res) => (res.ok ? res.text() : ""))
      .then((html) => {
        if (!html) {
          setHtmlContent("");
          return;
        }
        const doc = new DOMParser().parseFromString(html, "text/html");
        const article = doc.querySelector("article");
        setHtmlContent(article?.innerHTML ?? "");
      })
      .catch(() => {
        setHtmlContent("");
      });
  });

  const close = () => {
    navigate({
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        delete next.panelKind;
        delete next.panelId;
        delete next.panelLabel;
        return next;
      },
    });
  };

  return (
    <>
      <div
        classList={{ "detail-scrim": true, "is-visible": isOpen() }}
        onClick={close}
      />
      <aside
        id="detail-panel"
        classList={{ "detail-panel": true, "is-open": isOpen() }}
      >
        <Show when={isOpen()}>
          <div class="detail-panel-header">
            <div>
              <span id="detail-panel-kind" class="eyebrow">
                {panelKind()}
              </span>
              <h2 id="detail-panel-title">
                {panelLabel() || detail()?.label || panelId()}
              </h2>
            </div>
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
          <div id="detail-panel-body" class="detail-panel-body">
            <Show when={htmlContent()} fallback={
              <DetailMetadata detail={detail()} kind={panelKind()} />
            }>
              <div
                class="detail-page"
                data-entity-kind={panelKind()}
                data-entity-id={panelId()}
                innerHTML={htmlContent()}
              />
            </Show>
          </div>
        </Show>
      </aside>
    </>
  );
}

/** Render detail metadata directly when no static HTML page exists. */
function DetailMetadata(props: { detail: Record<string, any> | null; kind: string | undefined }) {
  const SKIP_FIELDS = new Set(["kind", "id", "label", "href", "color", "clusterColor"]);

  const fields = () => {
    const d = props.detail;
    if (!d) return [];
    return Object.entries(d).filter(([k]) => !SKIP_FIELDS.has(k));
  };

  return (
    <div class="detail-page" style={{ padding: "16px" }}>
      <Show when={props.detail} fallback={
        <p style={{ color: "var(--text-dim)" }}>No details available.</p>
      }>
        <Show when={props.detail?.description}>
          <p style={{ "margin-bottom": "16px", color: "var(--text-secondary, #c9d1d9)" }}>
            {props.detail!.description}
          </p>
        </Show>
        <table class="table" style={{ "font-size": "0.88rem" }}>
          <tbody>
            <For each={fields().filter(([k]) => k !== "description")}>
              {([key, value]) => (
                <tr>
                  <td style={{
                    padding: "6px 12px 6px 0",
                    color: "var(--text-dim, #8b949e)",
                    "vertical-align": "top",
                    "white-space": "nowrap",
                    "font-weight": "500",
                  }}>
                    {metadataFieldLabel(key)}
                  </td>
                  <td style={{ padding: "6px 0", color: "var(--text-secondary, #c9d1d9)" }}>
                    <MetadataValue value={value} />
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </div>
  );

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
      path: "Path",
      moduleId: "Module",
      systemId: "System",
      symbols: "Symbols",
      importedBy: "Imported By",
      imports: "Imports",
      mechanism: "Mechanism",
      from: "From",
      to: "To",
    };
    return labels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
  }
}

/** Render a metadata value — handles strings, numbers, arrays. */
function MetadataValue(props: { value: any }) {
  const v = () => props.value;

  return (
    <Show when={Array.isArray(v())} fallback={<span>{String(v())}</span>}>
      <Show when={(v() as any[]).length <= 8} fallback={
        <span>{(v() as any[]).length} items</span>
      }>
        <ul style={{ margin: 0, padding: "0 0 0 16px", "list-style": "disc" }}>
          <For each={v() as any[]}>
            {(item) => <li>{String(item)}</li>}
          </For>
        </ul>
      </Show>
    </Show>
  );
}
