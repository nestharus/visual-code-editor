import {
  makeRenderSnapshot,
  renderSurfaceFromString,
  renderViewportFromString,
  type RenderSurface,
  type RenderViewport,
} from "../app/lib/render-snapshot";
import { makeTrustSignal } from "../app/lib/trust";

const renderSurfaces = [
  "static-image",
  "wireframe",
  "animated",
] as const satisfies readonly RenderSurface[];

const renderViewports = [
  "mobile-portrait",
  "mobile-landscape",
  "tablet",
  "desktop",
  "desktop-wide",
] as const satisfies readonly RenderViewport[];

const renderSnapshot = makeRenderSnapshot({
  id: "render:button.primary.desktop",
  widgetId: "widget:button.primary",
  surface: "static-image",
  viewport: "desktop",
  theme: "dark",
  locale: "en-US",
  assetPath: "public/data/widget-renders/button.primary/desktop.png",
  capturedAtMs: 1_700_000_000_000,
  trust: makeTrustSignal("grounded", "user-confirmed"),
});

console.log(
  JSON.stringify({
    renderSurfaces: renderSurfaces.map(renderSurfaceFromString),
    renderViewports: renderViewports.map(renderViewportFromString),
    renderSnapshot,
  }),
);
