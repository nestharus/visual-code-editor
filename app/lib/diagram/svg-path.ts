/**
 * SVG path parsing — per governance mermaid-layout-engine.md
 */

export type PathCommand = {
  cmd: string;
  points: Array<{ x: number; y: number }>;
};

/**
 * Parse SVG path `d` attribute into commands with coordinates.
 * Handles M, L, C, Q commands used by Mermaid's dagre layout.
 */
export function parseSvgPath(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const re = /([MLCQZ])\s*((?:[\d.e+-]+[\s,]*)*)/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(d)) !== null) {
    const cmd = match[1].toUpperCase();
    const nums = match[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);

    if (cmd === "M" || cmd === "L") {
      commands.push({ cmd, points: [{ x: nums[0], y: nums[1] }] });
    } else if (cmd === "C") {
      commands.push({
        cmd: "C",
        points: [
          { x: nums[0], y: nums[1] },
          { x: nums[2], y: nums[3] },
          { x: nums[4], y: nums[5] },
        ],
      });
    } else if (cmd === "Q") {
      commands.push({
        cmd: "Q",
        points: [
          { x: nums[0], y: nums[1] },
          { x: nums[2], y: nums[3] },
        ],
      });
    }
  }

  return commands;
}

/**
 * Convert waypoints to Cytoscape segment-weights/distances.
 * Per governance: use `segments` curve style for Mermaid-routed edges.
 */
export function pathToSegments(
  waypoints: Array<{ x: number; y: number }>,
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
): { "segment-weights": string; "segment-distances": string } {
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const weights: number[] = [];
  const distances: number[] = [];

  for (const wp of waypoints) {
    const wx = wp.x - sourcePos.x;
    const wy = wp.y - sourcePos.y;
    const weight = (wx * ux + wy * uy) / len;
    const distance = wx * px + wy * py;
    weights.push(weight);
    distances.push(distance);
  }

  return {
    "segment-weights": weights.join(" "),
    "segment-distances": distances.join(" "),
  };
}

/**
 * Extract intermediate points from path commands (exclude start/end).
 */
export function extractIntermediatePoints(
  commands: PathCommand[],
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (const cmd of commands) {
    if (cmd.cmd === "L") {
      points.push(cmd.points[0]);
    } else if (cmd.cmd === "C") {
      // Use control points for bezier curves
      points.push(cmd.points[0]);
      points.push(cmd.points[1]);
    } else if (cmd.cmd === "Q") {
      points.push(cmd.points[0]);
    }
  }
  // Drop first and last (start/end near nodes)
  if (points.length >= 2) {
    return points.slice(1, -1);
  }
  return [];
}
