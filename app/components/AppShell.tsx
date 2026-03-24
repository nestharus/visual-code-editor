import type { ParentComponent } from "solid-js";

type AppShellProps = {
  breadcrumbs: string;
  subtitle?: string;
  activeView?: "diagram" | "source";
};

export const AppShell: ParentComponent<AppShellProps> = (props) => {
  const activeView = () => props.activeView ?? "diagram";

  return (
    <main class="page-shell app-shell">
      <header class="app-header">
        <div class="app-toolbar">
          <div>
            <p class="app-eyebrow">Visual Code Editor</p>
            <h1 class="app-title">Diagram Workspace</h1>
            <p class="app-subtitle">
              {props.subtitle ??
                "Inspect structural and behavioral diagrams from a single frontend shell."}
            </p>
          </div>
          <div class="app-view-toggle" role="tablist" aria-label="View toggle">
            <button
              type="button"
              classList={{ "app-toggle": true, "is-active": activeView() === "diagram" }}
              aria-pressed={activeView() === "diagram"}
            >
              Diagram
            </button>
            <button
              type="button"
              classList={{ "app-toggle": true, "is-active": activeView() === "source" }}
              aria-pressed={activeView() === "source"}
            >
              Source
            </button>
          </div>
        </div>
        <div class="breadcrumb-bar">
          <span class="breadcrumb-label">Path</span>
          <span class="breadcrumb-value mono">{props.breadcrumbs}</span>
        </div>
      </header>

      <section class="diagram-panel">
        <div class="diagram-panel__header">
          <div>
            <h2>Root Diagram</h2>
            <p>Initial canvas render for the frontend scaffold.</p>
          </div>
        </div>
        <div class="diagram-panel__body">{props.children}</div>
      </section>
    </main>
  );
};
