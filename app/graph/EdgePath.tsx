import { createMemo } from "solid-js";

import type { GraphEdge, GraphNode } from "./layout/types";

type EdgePathProps = {
  edge: GraphEdge;
  source: GraphNode;
  target: GraphNode;
  dimmed: boolean;
  highlighted: boolean;
  labelVisible: boolean;
  onEdgeTap?: (edgeId: string, kind: string, label: string) => void;
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

function getNodeCenter(node: GraphNode): Point {
  return {
    x: node.position?.x ?? 0,
    y: node.position?.y ?? 0,
  };
}

function getNodeSize(node: GraphNode) {
  return {
    width: node.size?.width ?? 150,
    height: node.size?.height ?? 60,
  };
}

export function getEdgeColor(kind: string) {
  return EDGE_COLORS[kind] ?? EDGE_COLORS.edge;
}

function cardBorderPoint(
  nodeX: number,
  nodeY: number,
  nodeW: number,
  nodeH: number,
  targetX: number,
  targetY: number,
): Point {
  const dx = targetX - nodeX;
  const dy = targetY - nodeY;
  const halfW = nodeW / 2;
  const halfH = nodeH / 2;

  if (dx === 0 && dy === 0) {
    return { x: nodeX, y: nodeY };
  }

  const scaleX = halfW / Math.abs(dx || 1);
  const scaleY = halfH / Math.abs(dy || 1);
  const scale = Math.min(scaleX, scaleY);

  return {
    x: nodeX + dx * scale,
    y: nodeY + dy * scale,
  };
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

function buildBezierPath(points: Point[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = index === 0 ? points[index] : points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const following =
      index + 2 < points.length ? points[index + 2] : points[index + 1];

    const control1 = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    };
    const control2 = {
      x: next.x - (following.x - current.x) / 6,
      y: next.y - (following.y - current.y) / 6,
    };

    path += ` C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${next.x} ${next.y}`;
  }

  return path;
}

function buildDirectEdgeGeometry(source: GraphNode, target: GraphNode): EdgeGeometry {
  const sourceCenter = getNodeCenter(source);
  const targetCenter = getNodeCenter(target);
  const sourceSize = getNodeSize(source);
  const targetSize = getNodeSize(target);
  const sourceAnchor = cardBorderPoint(
    sourceCenter.x,
    sourceCenter.y,
    sourceSize.width,
    sourceSize.height,
    targetCenter.x,
    targetCenter.y,
  );
  const targetAnchor = cardBorderPoint(
    targetCenter.x,
    targetCenter.y,
    targetSize.width,
    targetSize.height,
    sourceCenter.x,
    sourceCenter.y,
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
  source: GraphNode,
  target: GraphNode,
  bendPoints: Point[],
): EdgeGeometry {
  const sourceCenter = getNodeCenter(source);
  const targetCenter = getNodeCenter(target);
  const sourceSize = getNodeSize(source);
  const targetSize = getNodeSize(target);
  const entryPoint = bendPoints[0] ?? targetCenter;
  const exitPoint = bendPoints[bendPoints.length - 1] ?? sourceCenter;
  const sourceAnchor = cardBorderPoint(
    sourceCenter.x,
    sourceCenter.y,
    sourceSize.width,
    sourceSize.height,
    entryPoint.x,
    entryPoint.y,
  );
  const targetAnchor = cardBorderPoint(
    targetCenter.x,
    targetCenter.y,
    targetSize.width,
    targetSize.height,
    exitPoint.x,
    exitPoint.y,
  );
  const routedPoints = [sourceAnchor, ...bendPoints, targetAnchor];

  return {
    pathData: buildBezierPath(routedPoints),
    labelPoint: pointAtPolylineMidpoint(routedPoints),
  };
}

function buildEdgeGeometry(edge: GraphEdge, source: GraphNode, target: GraphNode): EdgeGeometry {
  if (edge.bendPoints?.length) {
    return buildBentEdgeGeometry(source, target, edge.bendPoints);
  }

  return buildDirectEdgeGeometry(source, target);
}

export function EdgePath(props: EdgePathProps) {
  const geometry = createMemo(() =>
    buildEdgeGeometry(props.edge, props.source, props.target),
  );
  const markerId = () => getMarkerIdForKind(props.edge.kind);
  const labelWidth = () => Math.max(24, (props.edge.label?.length ?? 0) * 5.4 + 12);

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
        class="edge-hit-target"
        d={geometry().pathData}
        onClick={(event) => {
          event.stopPropagation();
          props.onEdgeTap?.(props.edge.id, props.edge.kind, props.edge.label || "");
        }}
      />
      <path
        class="edge-path"
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
