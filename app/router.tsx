import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
} from "@tanstack/solid-router";
import { AppShell } from "./components/AppShell";
import { DiagramView } from "./pages/DiagramView";

// Root layout
const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

// Index redirects to behavioral (default view per governance)
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <DiagramView view="behavioral" />,
});

// Organizational routes
const organizationalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/organizational",
  component: () => <DiagramView view="organizational" />,
});

const clusterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/organizational/clusters/$clusterId",
  component: () => <DiagramView view="organizational" level="cluster" />,
});

const systemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/organizational/clusters/$clusterId/systems/$systemId",
  component: () => <DiagramView view="organizational" level="system" />,
});

// Behavioral routes
const behavioralRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/behavioral",
  component: () => <DiagramView view="behavioral" />,
});

const lifecycleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/behavioral/lifecycles/$lifecycleId",
  component: () => <DiagramView view="behavioral" level="lifecycle" />,
});

const stageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/behavioral/lifecycles/$lifecycleId/stages/$stageId",
  component: () => <DiagramView view="behavioral" level="stage" />,
});

// Build route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  organizationalRoute,
  clusterRoute,
  systemRoute,
  behavioralRoute,
  lifecycleRoute,
  stageRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}
