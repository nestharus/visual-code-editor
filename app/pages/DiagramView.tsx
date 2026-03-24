import { useParams } from "@tanstack/solid-router";
import { createMemo } from "solid-js";
import { DiagramCanvas } from "../components/DiagramCanvas";
import { cytoscapeStyle } from "../lib/cytoscape-style";

type DiagramViewProps = {
  view: "organizational" | "behavioral";
  level?: "cluster" | "system" | "lifecycle" | "stage";
};

// Placeholder test data — will be replaced by real data loading in B3/B5
const behavioralRootElements = [
  { data: { id: "pf", label: "Problem Framing" }, position: { x: 150, y: 200 } },
  { data: { id: "pb", label: "Philosophy Bootstrap" }, position: { x: 450, y: 200 } },
  { data: { id: "se", label: "Section Execution" }, position: { x: 750, y: 200 } },
  { data: { id: "cr", label: "Code Change Realization" }, position: { x: 1050, y: 200 } },
  { data: { id: "e_pf_pb", source: "pf", target: "pb", label: "artifacts" } },
  { data: { id: "e_pb_se", source: "pb", target: "se", label: "philosophy profile" } },
  { data: { id: "e_se_cr", source: "se", target: "cr", label: "proposals" } },
];

const organizationalRootElements = [
  { data: { id: "frame", label: "Frame" }, position: { x: 100, y: 200 } },
  { data: { id: "plan", label: "Plan" }, position: { x: 350, y: 200 } },
  { data: { id: "execute", label: "Execute" }, position: { x: 600, y: 200 } },
  { data: { id: "validate", label: "Validate" }, position: { x: 850, y: 200 } },
  { data: { id: "integrate", label: "Integrate" }, position: { x: 1100, y: 200 } },
  { data: { id: "e1", source: "frame", target: "plan" } },
  { data: { id: "e2", source: "plan", target: "execute" } },
  { data: { id: "e3", source: "execute", target: "validate" } },
  { data: { id: "e4", source: "validate", target: "integrate" } },
];

export function DiagramView(props: DiagramViewProps) {
  const params = useParams({ strict: false });

  const elements = createMemo(() => {
    if (props.view === "behavioral") {
      return behavioralRootElements;
    }
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
    <div class="diagram-view">
      <div class="diagram-view__header">
        <h2>{title()}</h2>
      </div>
      <DiagramCanvas elements={elements()} style={cytoscapeStyle} />
    </div>
  );
}
