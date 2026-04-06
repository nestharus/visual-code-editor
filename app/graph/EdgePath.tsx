import { createMemo, onCleanup } from "solid-js";

import type { ComposedRect } from "./PresentationStateService";
import { registerEdgePath } from "./TransportStore";
import type { GraphEdge } from "./layout/types";
import { anchorForShape, type NodeShape } from "./layout/shapes";

type EdgePathProps = {
  edge: GraphEdge;
  sourceRect: ComposedRect;
  targetRect: ComposedRect;
  sourceShape: NodeShape;
  targetShape: NodeShape;
  sourceTx: number;
  sourceTy: number;
  targetTx: number;
  targetTy: number;
  dimmed: boolean;
  highlighted: boolean;
  labelVisible: boolean;
  hitOnly?: boolean;
  onEdgeTap?: (edgeId: string, kind: string, label: string) => void;
  onEdgeHover?: (edgeId: string | null) => void;
};

type Point = { x: number; y: number };

type EdgeGeometry = {
  pathData: string;
  labelPoint: Point;
};

export const EDGE_COLORS: Record<string, string> = {
  edge: "#8b949e",
  "cluster-edge": "#30363d",
  "system-edge": "#484f58",
  "store-edge": "#d29922",
  "behavioral-edge": "#4fa9a0",
  "behavioral-back-edge": "#d29922",
  "file-import": "#262b33",
  "agent-invoke": "#9D7BEE",
};

export function getMarkerIdForKind(kind: string) {
  return `graph-arrowhead-${kind.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`;
}

function offsetEndpoint(point: Point, adjacent: Point | undefined, tx: number, ty: number, min = 4): Point {
  if (!adjacent) return point;
  const dx = adjacent.x - point.x;
  const dy = adjacent.y - point.y;
  return Math.hypot(dx, dy) > min ? { x: point.x + tx, y: point.y + ty } : point;
}

export function getEdgeColor(kind: string) {
  return EDGE_COLORS[kind] ?? EDGE_COLORS.edge;
}


function pointAtPolylineMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  let totalLength = 0;
  const segmentLengths: number[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    segmentLengths.push(length);
    totalLength += length;
  }

  if (totalLength === 0) return points[0];

  let traversed = 0;
  const halfLength = totalLength / 2;

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    const start = points[index];
    const end = points[index + 1];

    if (traversed + segmentLength >= halfLength) {
      const progress = (halfLength - traversed) / (segmentLength || 1);
      return {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      };
    }

    traversed += segmentLength;
  }

  return points[points.length - 1];
}

function cubicPointAt(
  start: Point,
  control1: Point,
  control2: Point,
  end: Point,
  t: number,
): Point {
  const inverse = 1 - t;
  return {
    x:
      inverse ** 3 * start.x +
      3 * inverse ** 2 * t * control1.x +
      3 * inverse * t ** 2 * control2.x +
      t ** 3 * end.x,
    y:
      inverse ** 3 * start.y +
      3 * inverse ** 2 * t * control1.y +
      3 * inverse * t ** 2 * control2.y +
      t ** 3 * end.y,
  };
}

function buildPolylinePath(points: Point[], cornerRadius = 6): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.hypot(dx1, dy1);

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2);

    const r = Math.min(cornerRadius, len1 / 2, len2 / 2);

    if (r < 1 || len1 < 1 || len2 < 1) {
      path += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    const beforeX = curr.x - (dx1 / len1) * r;
    const beforeY = curr.y - (dy1 / len1) * r;
    const afterX = curr.x + (dx2 / len2) * r;
    const afterY = curr.y + (dy2 / len2) * r;

    path += ` L ${beforeX} ${beforeY}`;
    path += ` Q ${curr.x} ${curr.y}, ${afterX} ${afterY}`;
  }

  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;

  return path;
}

function buildDirectEdgeGeometry(
  source: ComposedRect, target: ComposedRect,
  sourceShape: NodeShape, targetShape: NodeShape,
): EdgeGeometry {
  const sourceAnchor = anchorForShape(
    sourceShape, source.centerX, source.centerY,
    source.width, source.height, target.centerX, target.centerY,
  );
  const targetAnchor = anchorForShape(
    targetShape, target.centerX, target.centerY,
    target.width, target.height, source.centerX, source.centerY,
  );
  const dx = targetAnchor.x - sourceAnchor.x;
  const dy = targetAnchor.y - sourceAnchor.y;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const curveOffset = Math.min(Math.max(distance * 0.12, 18), 42);
  const control1 = {
    x: sourceAnchor.x + dx * 0.25 + normalX * curveOffset,
    y: sourceAnchor.y + dy * 0.25 + normalY * curveOffset,
  };
  const control2 = {
    x: sourceAnchor.x + dx * 0.75 + normalX * curveOffset,
    y: sourceAnchor.y + dy * 0.75 + normalY * curveOffset,
  };

  return {
    pathData: `M ${sourceAnchor.x} ${sourceAnchor.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${targetAnchor.x} ${targetAnchor.y}`,
    labelPoint: cubicPointAt(sourceAnchor, control1, control2, targetAnchor, 0.5),
  };
}

function buildBentEdgeGeometry(
  source: ComposedRect,
  target: ComposedRect,
  sourceShape: NodeShape,
  targetShape: NodeShape,
  bendPoints: Point[],
  sourceTx: number,
  sourceTy: number,
  targetTx: number,
  targetTy: number,
): EdgeGeometry {
  // ELK bend points include start/end positions at node boundaries.
  // Offset only first/last points by source/target tx/ty when segment is long enough.
  if (bendPoints.length >= 2) {
    const points = bendPoints.map((p, i) => {
      if (i === 0) return offsetEndpoint(p, bendPoints[1], sourceTx, sourceTy);
      if (i === bendPoints.length - 1) return offsetEndpoint(p, bendPoints[bendPoints.length - 2], targetTx, targetTy);
      return p;
    });

    return {
      pathData: buildPolylinePath(points, 6),
      labelPoint: pointAtPolylineMidpoint(points),
    };
  }

  // Fallback: single bend point, add source/target anchors from composedRect
  const point = bendPoints[0];
  const sourceAnchor = anchorForShape(
    sourceShape, source.centerX, source.centerY,
    source.width, source.height, point.x, point.y,
  );
  const targetAnchor = anchorForShape(
    targetShape, target.centerX, target.centerY,
    target.width, target.height, point.x, point.y,
  );
  const routedPoints = [sourceAnchor, point, targetAnchor];

  return {
    pathData: buildPolylinePath(routedPoints, 6),
    labelPoint: pointAtPolylineMidpoint(routedPoints),
  };
}

function buildEdgeGeometry(
  edge: GraphEdge,
  source: ComposedRect,
  target: ComposedRect,
  sourceShape: NodeShape,
  targetShape: NodeShape,
  sourceTx: number,
  sourceTy: number,
  targetTx: number,
  targetTy: number,
): EdgeGeometry {
  if (edge.bendPoints?.length) {
    return buildBentEdgeGeometry(source, target, sourceShape, targetShape, edge.bendPoints, sourceTx, sourceTy, targetTx, targetTy);
  }

  return buildDirectEdgeGeometry(source, target, sourceShape, targetShape);
}

export function EdgePath(props: EdgePathProps) {
  const geometry = createMemo(() =>
    buildEdgeGeometry(
      props.edge, props.sourceRect, props.targetRect,
      props.sourceShape, props.targetShape,
      props.sourceTx, props.sourceTy, props.targetTx, props.targetTy,
    ),
  );
  const markerId = () => getMarkerIdForKind(props.edge.kind);
  const labelWidth = () => Math.max(24, (props.edge.label?.length ?? 0) * 5.4 + 12);

  if (props.hitOnly) {
    return (
      <path
        class="edge-hit-target"
        d={geometry().pathData}
        onMouseEnter={() => props.onEdgeHover?.(props.edge.id)}
        onMouseLeave={() => props.onEdgeHover?.(null)}
        onClick={(event) => {
          event.stopPropagation();
          props.onEdgeTap?.(props.edge.id, props.edge.kind, props.edge.label || "");
        }}
      />
    );
  }

  return (
    <g
      classList={{
        "graph-edge": true,
        dimmed: props.dimmed,
        highlighted: props.highlighted,
        "flow-active": props.highlighted,
      }}
      data-kind={props.edge.kind}
    >
      <path
        class="edge-path"
        ref={(el: SVGPathElement) => {
          if (el && !props.hitOnly) {
            try {
              registerEdgePath(props.edge.id, el, props.edge.source, props.edge.target);
            } catch { /* SVG not yet in DOM */ }
          }
        }}
        data-kind={props.edge.kind}
        d={geometry().pathData}
        marker-end={`url(#${markerId()})`}
        style={{ color: getEdgeColor(props.edge.kind) }}
      />
      {props.labelVisible && props.edge.label ? (
        <g
          class="edge-label"
          transform={`translate(${geometry().labelPoint.x}, ${geometry().labelPoint.y})`}
          onClick={(event) => {
            event.stopPropagation();
            props.onEdgeTap?.(props.edge.id, props.edge.kind, props.edge.label || "");
          }}
        >
          <rect
            x={-labelWidth() / 2}
            y={-10}
            width={labelWidth()}
            height={20}
            rx={3}
          />
          <text text-anchor="middle" dominant-baseline="central">
            {props.edge.label}
          </text>
        </g>
      ) : null}
    </g>
  );
}
