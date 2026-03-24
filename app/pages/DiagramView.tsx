import { useParams } from "@tanstack/solid-router";
import { createMemo, createSignal } from "solid-js";
import type { Core } from "cytoscape";
import { DiagramCanvas } from "../components/DiagramCanvas";
import { NodeActionOverlay } from "../components/NodeActionOverlay";
import { cytoscapeStyle } from "../lib/cytoscape-style";

type DiagramViewProps = {
  view: "organizational" | "behavioral";
  level?: "cluster" | "system" | "lifecycle" | "stage";
};

// Placeholder test data — will be replaced by real data loading in B5+
const behavioralRootElements = [
  { data: { id: "pf", label: "Problem Framing", kind: "lifecycle" }, position: { x: 150, y: 200 } },
  { data: { id: "pb", label: "Philosophy Bootstrap", kind: "lifecycle" }, position: { x: 450, y: 200 } },
  { data: { id: "se", label: "Section Execution", kind: "lifecycle" }, position: { x: 750, y: 200 } },
  { data: { id: "cr", label: "Code Change Realization", kind: "lifecycle" }, position: { x: 1050, y: 200 } },
  { data: { id: "e_pf_pb", source: "pf", target: "pb", label: "artifacts" } },
  { data: { id: "e_pb_se", source: "pb", target: "se", label: "philosophy profile" } },
  { data: { id: "e_se_cr", source: "se", target: "cr", label: "proposals" } },
];

const organizationalRootElements = [
  { data: { id: "frame", label: "Frame", kind: "cluster" }, position: { x: 100, y: 200 } },
  { data: { id: "plan", label: "Plan", kind: "cluster" }, position: { x: 350, y: 200 } },
  { data: { id: "execute", label: "Execute", kind: "cluster" }, position: { x: 600, y: 200 } },
  { data: { id: "validate", label: "Validate", kind: "cluster" }, position: { x: 850, y: 200 } },
  { data: { id: "integrate", label: "Integrate", kind: "cluster" }, position: { x: 1100, y: 200 } },
  { data: { id: "e1", source: "frame", target: "plan" } },
  { data: { id: "e2", source: "plan", target: "execute" } },
  { data: { id: "e3", source: "execute", target: "validate" } },
  { data: { id: "e4", source: "validate", target: "integrate" } },
];

export function DiagramView(props: DiagramViewProps) {
  const params = useParams({ strict: false });
  const [cy, setCy] = createSignal<Core | undefined>();
  const [container, setContainer] = createSignal<HTMLDivElement | undefined>();

  const elements = createMemo(() => {
    if (props.view === "behavioral") return behavioralRootElements;
    return organizationalRootElements;
  });

  const title = createMemo(() => {
    if (props.level === "cluster") return `Cluster: ${params.clusterId}`;
    if (props.level === "system") return `System: ${params.systemId}`;
    if (props.level === "lifecycle") return `Lifecycle: ${params.lifecycleId}`;
    if (props.level === "stage") return `Stage: ${params.stageId}`;
    return props.view === "behavioral" ? "Behavioral Root" : "Organizational Root";
  });

  return (
    <div class="diagram-view" style={{ position: "relative" }}>
      <div class="diagram-view__header">
        <h2>{title()}</h2>
      </div>
      <div style={{ position: "relative" }}>
        <DiagramCanvas
          elements={elements()}
          style={cytoscapeStyle}
          onReady={(cyInstance, containerEl) => {
            setCy(cyInstance);
            setContainer(containerEl);
          }}
        />
        <NodeActionOverlay cy={cy()} container={container()} />
      </div>
    </div>
  );
}
