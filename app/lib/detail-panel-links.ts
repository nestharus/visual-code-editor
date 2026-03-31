import type { DiagramData } from "./diagram-data";

export type LinkAction =
  | { type: "route"; to: string }
  | { type: "panel"; panelKind: string; panelId: string; panelLabel: string }
  | { type: "passthrough" };

export function rebaseArticleLinks(article: Element, fetchedPageUrl: string): void {
  for (const element of article.querySelectorAll("[href], [src]")) {
    rebaseAttribute(element, "href", fetchedPageUrl);
    rebaseAttribute(element, "src", fetchedPageUrl);
  }
}

export function resolveLegacyLink(
  resolvedUrl: string,
  diagramData: DiagramData,
  currentParams: { clusterId?: string },
): LinkAction {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(resolvedUrl);
  } catch {
    return { type: "passthrough" };
  }

  const siteMarker = "/site/";
  const siteIndex = parsedUrl.pathname.indexOf(siteMarker);
  if (siteIndex === -1) {
    return { type: "passthrough" };
  }

  const siteRelativePath = parsedUrl.pathname.slice(siteIndex + siteMarker.length);

  const clusterMatch = siteRelativePath.match(/^clusters\/(.+)\.html$/);
  if (clusterMatch) {
    const clusterId = decodeURIComponent(clusterMatch[1]);
    return { type: "route", to: `/organizational/clusters/${clusterId}` };
  }

  const systemMatch = siteRelativePath.match(/^systems\/(.+)\.html$/);
  if (systemMatch) {
    const systemId = decodeURIComponent(systemMatch[1]);
    const clusterId =
      diagramData.organizational.systems[systemId]?.clusterId || currentParams.clusterId;
    if (!clusterId) {
      return { type: "passthrough" };
    }
    return {
      type: "route",
      to: `/organizational/clusters/${clusterId}/systems/${systemId}`,
    };
  }

  const panelMatch = siteRelativePath.match(/^(modules|agents|stores|edges)\/(.+)\.html$/);
  if (!panelMatch) {
    return { type: "passthrough" };
  }

  const panelKindByDirectory: Record<string, string> = {
    modules: "module",
    agents: "agent",
    stores: "store",
    edges: "edge",
  };

  const panelKind = panelKindByDirectory[panelMatch[1]];
  const panelId = decodeURIComponent(panelMatch[2]);
  const detailLabel = diagramData.details[panelId]?.label;
  return {
    type: "panel",
    panelKind,
    panelId,
    panelLabel: typeof detailLabel === "string" ? detailLabel : panelId,
  };
}

function rebaseAttribute(element: Element, attribute: "href" | "src", fetchedPageUrl: string) {
  const value = element.getAttribute(attribute);
  if (!value) {
    return;
  }

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("#") ||
    value.startsWith("javascript:")
  ) {
    return;
  }

  try {
    element.setAttribute(attribute, new URL(value, fetchedPageUrl).href);
  } catch {
    // Leave invalid URLs untouched.
  }
}
