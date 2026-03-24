import { useNavigate, useLocation, Link } from "@tanstack/solid-router";
import { createMemo, type ParentComponent } from "solid-js";
import { DetailPanel } from "./DetailPanel";
import { useWatchSubscription } from "../lib/live/useWatchSubscription";

export const AppShell: ParentComponent = (props) => {
  useWatchSubscription();
  const navigate = useNavigate();
  const location = useLocation();

  const activeView = createMemo(() => {
    const path = location().pathname;
    if (path.startsWith("/organizational")) return "organizational";
    return "behavioral";
  });

  const breadcrumbs = createMemo(() => {
    const path = location().pathname;
    const parts: { label: string; href?: string }[] = [];

    if (path.startsWith("/organizational")) {
      parts.push({ label: "Organizational", href: "/organizational" });
      const clusterMatch = path.match(/\/clusters\/([^/]+)/);
      if (clusterMatch) {
        parts.push({
          label: decodeURIComponent(clusterMatch[1]),
          href: `/organizational/clusters/${clusterMatch[1]}`,
        });
      }
      const systemMatch = path.match(/\/systems\/([^/]+)/);
      if (systemMatch) {
        parts.push({ label: decodeURIComponent(systemMatch[1]) });
      }
    } else {
      parts.push({ label: "Behavioral", href: "/behavioral" });
      const lifecycleMatch = path.match(/\/lifecycles\/([^/]+)/);
      if (lifecycleMatch) {
        parts.push({
          label: decodeURIComponent(lifecycleMatch[1]),
          href: `/behavioral/lifecycles/${lifecycleMatch[1]}`,
        });
      }
      const stageMatch = path.match(/\/stages\/([^/]+)/);
      if (stageMatch) {
        parts.push({ label: decodeURIComponent(stageMatch[1]) });
      }
    }

    return parts;
  });

  return (
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
        <main id="diagram-viewport">{props.children}</main>
        <DetailPanel />
      </div>
    </div>
  );
};
