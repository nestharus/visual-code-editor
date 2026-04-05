export type GraphNode = {
  id: string;
  kind: string;
  label: string;
  data: Record<string, unknown>;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  parent?: string;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: string;
  label?: string;
  data?: Record<string, unknown>;
  bendPoints?: Array<{ x: number; y: number }>;
};

export type GraphDefinition = {
  id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  direction?: "DOWN" | "RIGHT";
};
