import { For, createMemo, onCleanup } from "solid-js";
import { clearPathRegistry, registerEdgePath, type TransportStoreType } from "./TransportStore";
import type { CombinedScenario, ScenarioBeat } from "./BehaviorPlayback";

type ScenarioBoxProps = {
  scenario: CombinedScenario;
  currentBeatIndex: number;
  width: number;
  height: number;
  transport: TransportStoreType;
};

type NodePos = { id: string; x: number; y: number };

function layoutGrid(nodeIds: string[], width: number, height: number, padding = 40): NodePos[] {
  const count = nodeIds.length;
  if (count === 0) return [];

  const cols = count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const cellW = (width - padding * 2) / cols;
  const cellH = (height - padding * 2) / rows;

  return nodeIds.map((id, i) => ({
    id,
    x: padding + (i % cols) * cellW + cellW / 2,
    y: padding + Math.floor(i / cols) * cellH + cellH / 2,
  }));
}

function getPathBeats(beats: ScenarioBeat[]): Array<ScenarioBeat & { kind: "path" }> {
  return beats.filter((b): b is ScenarioBeat & { kind: "path" } => b.kind === "path");
}

export function ScenarioBox(props: ScenarioBoxProps) {
  const nodes = createMemo(() =>
    layoutGrid(props.scenario.participants, props.width, props.height),
  );

  const nodeById = createMemo(() =>
    new Map(nodes().map((n) => [n.id, n])),
  );

  const edges = createMemo(() => {
    const pathBeats = getPathBeats(props.scenario.beats);
    const lookup = nodeById();
    const seen = new Set<string>();

    return pathBeats
      .filter((beat) => {
        const key = `${beat.fromNodeId}->${beat.toNodeId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return lookup.has(beat.fromNodeId) && lookup.has(beat.toNodeId);
      })
      .map((beat) => {
        const from = lookup.get(beat.fromNodeId)!;
        const to = lookup.get(beat.toNodeId)!;
        const edgeId = beat.edgeIds?.[0] ?? `modal-${beat.fromNodeId}-${beat.toNodeId}`;
        return { id: edgeId, from, to, label: beat.caption };
      });
  });

  const activeBeat = createMemo(() => {
    const beat = props.scenario.beats[props.currentBeatIndex];
    return beat?.kind === "path" ? beat : null;
  });

  onCleanup(() => {
    clearPathRegistry("modal");
  });

  return (
    <div class="scenario-box">
      <div class="scenario-box-title">{props.scenario.title}</div>
      <svg
        class="scenario-box-svg"
        width={props.width}
        height={props.height}
        viewBox={`0 0 ${props.width} ${props.height}`}
      >
        {/* Edges */}
        <For each={edges()}>
          {(edge) => {
            const dx = edge.to.x - edge.from.x;
            const dy = edge.to.y - edge.from.y;
            const dist = Math.hypot(dx, dy);
            const nx = -dy / (dist || 1);
            const ny = dx / (dist || 1);
            const curve = Math.min(dist * 0.15, 30);
            const cx1 = edge.from.x + dx * 0.25 + nx * curve;
            const cy1 = edge.from.y + dy * 0.25 + ny * curve;
            const cx2 = edge.from.x + dx * 0.75 + nx * curve;
            const cy2 = edge.from.y + dy * 0.75 + ny * curve;
            const isActive = activeBeat()?.fromNodeId === edge.from.id && activeBeat()?.toNodeId === edge.to.id;
            const d = `M ${edge.from.x} ${edge.from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${edge.to.x} ${edge.to.y}`;

            return (
              <g classList={{ "scenario-edge": true, "is-active": isActive }}>
                <path
                  class="scenario-edge-path"
                  d={d}
                  ref={(el: SVGPathElement) => {
                    if (el) {
                      try {
                        registerEdgePath(edge.id, el, edge.from.id, edge.to.id, "modal");
                      } catch { /* not in DOM yet */ }
                    }
                  }}
                />
                <circle
                  class="scenario-edge-arrow"
                  cx={edge.to.x}
                  cy={edge.to.y}
                  r={4}
                />
              </g>
            );
          }}
        </For>

        <g class="transport-layer">
          <For each={props.transport.tokens as readonly import("./TransportStore").TransportToken[]}>
            {(token) => (
              <circle
                cx={props.transport.getTokenPosition(token)?.x ?? -100}
                cy={props.transport.getTokenPosition(token)?.y ?? -100}
                r={token.status === "pulse" ? 12 : 5}
                classList={{
                  "transport-token": true,
                  "transport-pulse": token.status === "pulse",
                  "transport-hidden": token.status === "done",
                }}
              />
            )}
          </For>
        </g>

        {/* Nodes */}
        <For each={nodes()}>
          {(node) => {
            const isActive = () => {
              const beat = activeBeat();
              return beat?.fromNodeId === node.id || beat?.toNodeId === node.id;
            };
            const wasVisited = () => {
              const idx = props.currentBeatIndex;
              const beats = props.scenario.beats;
              for (let i = 0; i <= idx; i++) {
                const b = beats[i];
                if (b?.fromNodeId === node.id || b?.toNodeId === node.id) return true;
              }
              return false;
            };

            return (
              <g
                classList={{
                  "scenario-node": true,
                  "is-active": isActive(),
                  "is-visited": wasVisited() && !isActive(),
                  "is-waiting": !wasVisited() && !isActive(),
                }}
                transform={`translate(${node.x}, ${node.y})`}
              >
                <rect
                  x={-50}
                  y={-20}
                  width={100}
                  height={40}
                  rx={10}
                  class="scenario-node-rect"
                />
                <text
                  text-anchor="middle"
                  dominant-baseline="central"
                  class="scenario-node-label"
                >
                  {node.id}
                </text>
              </g>
            );
          }}
        </For>
      </svg>
    </div>
  );
}
