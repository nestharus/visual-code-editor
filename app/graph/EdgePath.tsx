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
  sourceInnerScale?: number;
  targetInnerScale?: number;
  dimmed: boolean;
  highlighted: boolean;
  labelVisible: boolean;
  hitOnly?: boolean;
  labelOnly?: boolean;
  onEdgeTap?: (edgeId: string, kind: string, label: string) => void;
  onEdgeHover?: (edgeId: string | null) => void;
};

type Point = { x: number; y: number };

type EdgeGeometry = {
  pathData: string;
  labelPoint: Point;
};

const EDGE_HIT_TARGET_TRIM_PX = 24;
const EDGE_HIT_TARGET_MIN_LENGTH_PX = 12;

type PathCommand =
  | { type: "M" | "L"; values: [number, number] }
  | { type: "Q"; values: [number, number, number, number] }
  | { type: "C"; values: [number, number, number, number, number, number] };

export const EDGE_COLORS: Record<string, string> = {
  edge: "#8b949e",
  "cluster-edge": "#30363d",
  "system-edge": "#484f58",
  "store-edge": "#d29922",
  "behavioral-edge": "#4fa9a0",
  "behavioral-back-edge": "#d29922",
  "file-import": "#262b33",
  "agent-invoke": "#9D7BEE",
  "ui-implements": "#a78bfa",
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

function scaleDimension(size: number, scale: number): number {
  return size * scale;
}

function offsetScaledBoundaryPoint(point: Point, center: Point, scale: number): Point {
  if (scale === 1) return point;

  return {
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
  };
}

export function getEdgeColor(kind: string) {
  return EDGE_COLORS[kind] ?? EDGE_COLORS.edge;
}

function pathCommandValueCount(type: PathCommand["type"]): number {
  switch (type) {
    case "M":
    case "L":
      return 2;
    case "Q":
      return 4;
    case "C":
      return 6;
  }
}

function isPathCommandToken(token: string): token is PathCommand["type"] {
  return token === "M" || token === "L" || token === "Q" || token === "C";
}

function parsePathCommands(d: string): PathCommand[] | null {
  const tokens = d.match(/[MLQC]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi);
  if (!tokens) return null;

  const commands: PathCommand[] = [];
  let index = 0;

  while (index < tokens.length) {
    const type = tokens[index]?.toUpperCase();
    index += 1;

    if (!type || !isPathCommandToken(type)) return null;

    const valueCount = pathCommandValueCount(type);
    const values: number[] = [];

    for (let valueIndex = 0; valueIndex < valueCount; valueIndex += 1) {
      const token = tokens[index];
      if (!token || isPathCommandToken(token.toUpperCase())) return null;

      const value = Number(token);
      if (!Number.isFinite(value)) return null;

      values.push(value);
      index += 1;
    }

    if (type === "M" || type === "L") {
      commands.push({ type, values: [values[0], values[1]] });
    } else if (type === "Q") {
      commands.push({ type, values: [values[0], values[1], values[2], values[3]] });
    } else {
      commands.push({ type, values: [values[0], values[1], values[2], values[3], values[4], values[5]] });
    }
  }

  return commands;
}

function commandEndpoint(command: PathCommand): Point {
  return {
    x: command.values[command.values.length - 2],
    y: command.values[command.values.length - 1],
  };
}

function setCommandEndpoint(command: PathCommand, point: Point): void {
  command.values[command.values.length - 2] = point.x;
  command.values[command.values.length - 1] = point.y;
}

function startAdjacentPoint(command: PathCommand): Point {
  return { x: command.values[0], y: command.values[1] };
}

function endAdjacentPoint(commands: PathCommand[], lastIndex: number): Point | null {
  const last = commands[lastIndex];

  if (last.type === "C") {
    return { x: last.values[2], y: last.values[3] };
  }
  if (last.type === "Q") {
    return { x: last.values[0], y: last.values[1] };
  }

  const previous = commands[lastIndex - 1];
  return previous ? commandEndpoint(previous) : null;
}

function movePointToward(
  point: Point,
  adjacent: Point | null,
  amount: number,
  minRemainingLength = 0,
): Point {
  if (!adjacent || amount <= 0) return point;

  const dx = adjacent.x - point.x;
  const dy = adjacent.y - point.y;
  const length = Math.hypot(dx, dy);

  if (length < 0.001) return point;

  const distance = Math.min(amount, Math.max(0, length - minRemainingLength));
  return {
    x: point.x + (dx / length) * distance,
    y: point.y + (dy / length) * distance,
  };
}

function formatPathNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

function serializePathCommands(commands: PathCommand[]): string {
  return commands.map((command) => {
    const values = command.values.map(formatPathNumber);

    if (command.type === "Q") {
      return `Q ${values[0]} ${values[1]}, ${values[2]} ${values[3]}`;
    }
    if (command.type === "C") {
      return `C ${values[0]} ${values[1]}, ${values[2]} ${values[3]}, ${values[4]} ${values[5]}`;
    }

    return `${command.type} ${values[0]} ${values[1]}`;
  }).join(" ");
}

function shortenPathEnds(d: string, amount: number): string {
  const commands = parsePathCommands(d);

  if (!commands || commands.length < 2 || commands[0].type !== "M") {
    return d;
  }

  const first = commands[0];
  const lastIndex = commands.length - 1;
  const last = commands[lastIndex];

  if (commands.length === 2 && last.type === "L") {
    const start = commandEndpoint(first);
    const end = commandEndpoint(last);
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const trimAmount = Math.min(
      amount,
      Math.max(0, (length - EDGE_HIT_TARGET_MIN_LENGTH_PX) / 2),
    );

    setCommandEndpoint(first, movePointToward(start, end, trimAmount));
    setCommandEndpoint(last, movePointToward(end, start, trimAmount));

    return serializePathCommands(commands);
  }

  const trimmedStart = movePointToward(
    commandEndpoint(first),
    startAdjacentPoint(commands[1]),
    amount,
    EDGE_HIT_TARGET_MIN_LENGTH_PX,
  );
  const trimmedEnd = movePointToward(
    commandEndpoint(last),
    endAdjacentPoint(commands, lastIndex),
    amount,
    EDGE_HIT_TARGET_MIN_LENGTH_PX,
  );

  setCommandEndpoint(first, trimmedStart);
  setCommandEndpoint(last, trimmedEnd);

  return serializePathCommands(commands);
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
  sourceInnerScale: number,
  targetInnerScale: number,
): EdgeGeometry {
  const sourceAnchor = anchorForShape(
    sourceShape, source.centerX, source.centerY,
    scaleDimension(source.width, sourceInnerScale),
    scaleDimension(source.height, sourceInnerScale),
    target.centerX, target.centerY,
  );
  const targetAnchor = anchorForShape(
    targetShape, target.centerX, target.centerY,
    scaleDimension(target.width, targetInnerScale),
    scaleDimension(target.height, targetInnerScale),
    source.centerX, source.centerY,
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
  sourceInnerScale: number,
  targetInnerScale: number,
): EdgeGeometry {
  // ELK bend points include start/end positions at node boundaries.
  // Offset only first/last points by source/target tx/ty when segment is long enough,
  // then expand from the node center to match the visible scaled boundary.
  if (bendPoints.length >= 2) {
    const points = bendPoints.map((p, i) => {
      if (i === 0) {
        const translated = offsetEndpoint(p, bendPoints[1], sourceTx, sourceTy);
        return offsetScaledBoundaryPoint(
          translated,
          { x: source.centerX, y: source.centerY },
          sourceInnerScale,
        );
      }
      if (i === bendPoints.length - 1) {
        const translated = offsetEndpoint(p, bendPoints[bendPoints.length - 2], targetTx, targetTy);
        return offsetScaledBoundaryPoint(
          translated,
          { x: target.centerX, y: target.centerY },
          targetInnerScale,
        );
      }
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
    scaleDimension(source.width, sourceInnerScale),
    scaleDimension(source.height, sourceInnerScale),
    point.x, point.y,
  );
  const targetAnchor = anchorForShape(
    targetShape, target.centerX, target.centerY,
    scaleDimension(target.width, targetInnerScale),
    scaleDimension(target.height, targetInnerScale),
    point.x, point.y,
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
  sourceInnerScale: number,
  targetInnerScale: number,
): EdgeGeometry {
  if (edge.bendPoints?.length) {
    return buildBentEdgeGeometry(
      source,
      target,
      sourceShape,
      targetShape,
      edge.bendPoints,
      sourceTx,
      sourceTy,
      targetTx,
      targetTy,
      sourceInnerScale,
      targetInnerScale,
    );
  }

  return buildDirectEdgeGeometry(
    source,
    target,
    sourceShape,
    targetShape,
    sourceInnerScale,
    targetInnerScale,
  );
}

export function EdgePath(props: EdgePathProps) {
  const geometry = createMemo(() =>
    buildEdgeGeometry(
      props.edge, props.sourceRect, props.targetRect,
      props.sourceShape, props.targetShape,
      props.sourceTx,
      props.sourceTy,
      props.targetTx,
      props.targetTy,
      props.sourceInnerScale ?? 1,
      props.targetInnerScale ?? 1,
    ),
  );
  const markerId = () => getMarkerIdForKind(props.edge.kind);
  const labelWidth = () => Math.max(28, (props.edge.label?.length ?? 0) * 6 + 14);

  if (props.labelOnly) {
    if (!props.labelVisible || !props.edge.label) return null;
    return (
      <g
        class="edge-label"
        transform={`translate(${geometry().labelPoint.x}, ${geometry().labelPoint.y})`}
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
    );
  }

  if (props.hitOnly) {
    return (
      <path
        class="edge-hit-target"
        d={shortenPathEnds(geometry().pathData, EDGE_HIT_TARGET_TRIM_PX)}
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
        style={{ stroke: getEdgeColor(props.edge.kind) }}
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
