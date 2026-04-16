import clusterIcon from "../assets/icons/cluster.svg?raw";
import systemIcon from "../assets/icons/system.svg?raw";
import externalIcon from "../assets/icons/external.svg?raw";
import storeIcon from "../assets/icons/store.svg?raw";
import fileNodeIcon from "../assets/icons/file-node.svg?raw";
import agentNodeIcon from "../assets/icons/agent-node.svg?raw";
import behavioralLifecycleIcon from "../assets/icons/behavioral-lifecycle.svg?raw";
import behavioralStageIcon from "../assets/icons/behavioral-stage.svg?raw";
import behavioralStepIcon from "../assets/icons/behavioral-step.svg?raw";

export type NodeVisual = {
  iconDataUri: string;
  isContainer: boolean;
  hasDetail: boolean;
  frameStyle: {
    borderWidth: number;
    borderStyle?: "solid" | "dashed";
  };
  zoomTiers: {
    dot: number;
    icon: number;
    label: number;
  };
};

const toDataUri = (svgContent: string) =>
  `data:image/svg+xml,${encodeURIComponent(svgContent)}`;

const defaultZoomTiers = {
  dot: 0.2,
  icon: 0.45,
  label: 0.7,
};

export const nodeIconSvgs: Record<string, string> = {
  cluster: clusterIcon,
  system: systemIcon,
  external: externalIcon,
  store: storeIcon,
  "file-node": fileNodeIcon,
  "agent-node": agentNodeIcon,
  "behavioral-lifecycle": behavioralLifecycleIcon,
  "behavioral-stage": behavioralStageIcon,
  "behavioral-step": behavioralStepIcon,
};

export const nodeVisuals: Record<string, NodeVisual> = {
  cluster: {
    iconDataUri: toDataUri(clusterIcon),
    isContainer: true,
    hasDetail: true,
    frameStyle: { borderWidth: 3 },
    zoomTiers: defaultZoomTiers,
  },
  system: {
    iconDataUri: toDataUri(systemIcon),
    isContainer: true,
    hasDetail: true,
    frameStyle: { borderWidth: 2 },
    zoomTiers: defaultZoomTiers,
  },
  external: {
    iconDataUri: toDataUri(externalIcon),
    isContainer: false,
    hasDetail: true,
    frameStyle: { borderWidth: 1, borderStyle: "dashed" },
    zoomTiers: defaultZoomTiers,
  },
  store: {
    iconDataUri: toDataUri(storeIcon),
    isContainer: false,
    hasDetail: true,
    frameStyle: { borderWidth: 2 },
    zoomTiers: defaultZoomTiers,
  },
  "file-node": {
    iconDataUri: toDataUri(fileNodeIcon),
    isContainer: false,
    hasDetail: true,
    frameStyle: { borderWidth: 2 },
    zoomTiers: defaultZoomTiers,
  },
  "agent-node": {
    iconDataUri: toDataUri(agentNodeIcon),
    isContainer: false,
    hasDetail: true,
    frameStyle: { borderWidth: 2 },
    zoomTiers: defaultZoomTiers,
  },
  "behavioral-lifecycle": {
    iconDataUri: toDataUri(behavioralLifecycleIcon),
    isContainer: true,
    hasDetail: true,
    frameStyle: { borderWidth: 2.5 },
    zoomTiers: defaultZoomTiers,
  },
  "behavioral-stage": {
    iconDataUri: toDataUri(behavioralStageIcon),
    isContainer: true,
    hasDetail: true,
    frameStyle: { borderWidth: 2 },
    zoomTiers: defaultZoomTiers,
  },
  "behavioral-step": {
    iconDataUri: toDataUri(behavioralStepIcon),
    isContainer: false,
    hasDetail: true,
    frameStyle: { borderWidth: 2 },
    zoomTiers: defaultZoomTiers,
  },
  "ui-screen": {
    iconDataUri: "",
    isContainer: true,
    hasDetail: true,
    frameStyle: { borderWidth: 2 },
    zoomTiers: defaultZoomTiers,
  },
  "ui-component": {
    iconDataUri: "",
    isContainer: false,
    hasDetail: true,
    frameStyle: { borderWidth: 1.5 },
    zoomTiers: defaultZoomTiers,
  },
};

const kindToKey: Record<string, string | undefined> = {
  cluster: "cluster",
  system: "system",
  lifecycle: "behavioral-lifecycle",
  stage: "behavioral-stage",
  step: "behavioral-step",
  file: "file-node",
  agent: "agent-node",
  store: "store",
  external: "external",
  "ui-screen": "ui-screen",
  "ui-component": "ui-component",
  edge: undefined,
};

function resolveNodeVisualKey(kind: string): string | undefined {
  if (!kind) return undefined;
  if (kind in nodeVisuals) {
    return kind;
  }
  return kindToKey[kind];
}

export function getNodeVisual(classes: string | string[]): NodeVisual | undefined {
  const classList = Array.isArray(classes) ? classes : classes.split(/\s+/);
  for (const nodeClass of classList) {
    if (nodeClass in nodeVisuals) {
      return nodeVisuals[nodeClass];
    }
  }
  return undefined;
}

export function getNodeVisualByKind(kind: string): NodeVisual | undefined {
  const key = resolveNodeVisualKey(kind);
  return key ? nodeVisuals[key] : undefined;
}

export function getIconSvgByKind(kind: string): string | undefined {
  const key = resolveNodeVisualKey(kind);
  return key ? nodeIconSvgs[key] : undefined;
}
