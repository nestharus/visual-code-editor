export type NodeShape = "rounded" | "circle" | "pill" | "hexagon" | "octagon";

const KIND_TO_SHAPE: Record<string, NodeShape> = {
  cluster: "rounded",
  system: "rounded",
  "behavioral-lifecycle": "rounded",
  "behavioral-stage": "pill",
  store: "circle",
  "agent-node": "hexagon",
  external: "octagon",
  "file-node": "rounded",
  "behavioral-step": "rounded",
  "module-group": "rounded",
};

export function resolveNodeShape(kind: string, isCompound: boolean): NodeShape {
  if (isCompound) return "rounded";
  return KIND_TO_SHAPE[kind] ?? "rounded";
}

export function shapeClassName(shape: NodeShape): string {
  return `graph-card--shape-${shape}`;
}

type Point = { x: number; y: number };

export function anchorForShape(
  shape: NodeShape,
  cx: number,
  cy: number,
  w: number,
  h: number,
  towardX: number,
  towardY: number,
): Point {
  switch (shape) {
    case "circle":
      return anchorEllipse(cx, cy, w, h, towardX, towardY);
    case "pill":
      return anchorEllipse(cx, cy, w, h, towardX, towardY);
    case "hexagon":
      return anchorPolygon(cx, cy, w, h, HEXAGON_VERTICES, towardX, towardY);
    case "octagon":
      return anchorPolygon(cx, cy, w, h, OCTAGON_VERTICES, towardX, towardY);
    default:
      return anchorRect(cx, cy, w, h, towardX, towardY);
  }
}

function anchorRect(
  cx: number, cy: number, w: number, h: number,
  tx: number, ty: number,
): Point {
  const dx = tx - cx;
  const dy = ty - cy;
  const halfW = w / 2;
  const halfH = h / 2;

  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const scaleX = halfW / Math.abs(dx || 1);
  const scaleY = halfH / Math.abs(dy || 1);
  const scale = Math.min(scaleX, scaleY);

  return { x: cx + dx * scale, y: cy + dy * scale };
}

function anchorEllipse(
  cx: number, cy: number, w: number, h: number,
  tx: number, ty: number,
): Point {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const rx = w / 2;
  const ry = h / 2;
  const scale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));

  return { x: cx + dx * scale, y: cy + dy * scale };
}

// Normalized polygon vertices (0-1 range, matching CSS clip-path percentages)
const HEXAGON_VERTICES: Point[] = [
  { x: 0.25, y: 0 }, { x: 0.75, y: 0 }, { x: 1, y: 0.5 },
  { x: 0.75, y: 1 }, { x: 0.25, y: 1 }, { x: 0, y: 0.5 },
];

const OCTAGON_VERTICES: Point[] = [
  { x: 0.3, y: 0 }, { x: 0.7, y: 0 }, { x: 1, y: 0.3 }, { x: 1, y: 0.7 },
  { x: 0.7, y: 1 }, { x: 0.3, y: 1 }, { x: 0, y: 0.7 }, { x: 0, y: 0.3 },
];

function anchorPolygon(
  cx: number, cy: number, w: number, h: number,
  vertices: Point[], tx: number, ty: number,
): Point {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const left = cx - w / 2;
  const top = cy - h / 2;

  // Convert normalized vertices to absolute coordinates
  const abs = vertices.map((v) => ({ x: left + v.x * w, y: top + v.y * h }));

  // Find intersection of ray from center toward target with polygon edges
  let bestT = Number.POSITIVE_INFINITY;
  let bestPoint: Point = { x: cx, y: cy };

  for (let i = 0; i < abs.length; i++) {
    const a = abs[i];
    const b = abs[(i + 1) % abs.length];

    const intersection = raySegmentIntersection(cx, cy, dx, dy, a, b);
    if (intersection && intersection.t > 0 && intersection.t < bestT) {
      bestT = intersection.t;
      bestPoint = intersection.point;
    }
  }

  return bestPoint;
}

function raySegmentIntersection(
  ox: number, oy: number, dx: number, dy: number,
  a: Point, b: Point,
): { t: number; point: Point } | null {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const denom = dx * ey - dy * ex;

  if (Math.abs(denom) < 1e-10) return null;

  const t = ((a.x - ox) * ey - (a.y - oy) * ex) / denom;
  const u = ((a.x - ox) * dy - (a.y - oy) * dx) / denom;

  if (t <= 0 || u < 0 || u > 1) return null;

  return {
    t,
    point: { x: ox + dx * t, y: oy + dy * t },
  };
}
