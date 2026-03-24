import { render } from "solid-js/web";
import { AppShell } from "./components/AppShell";
import { DiagramCanvas } from "./components/DiagramCanvas";
import { cytoscapeStyle } from "./lib/cytoscape-style";
import "./styles/theme.css";

// Minimal test elements — verifies Cytoscape renders in the SolidJS shell
const testElements = [
  { data: { id: "a", label: "Problem Framing" }, position: { x: 100, y: 200 } },
  { data: { id: "b", label: "Philosophy Bootstrap" }, position: { x: 400, y: 200 } },
  { data: { id: "c", label: "Section Execution" }, position: { x: 700, y: 200 } },
  { data: { id: "d", label: "Code Change Realization" }, position: { x: 1000, y: 200 } },
  { data: { id: "ab", source: "a", target: "b" } },
  { data: { id: "bc", source: "b", target: "c" } },
  { data: { id: "cd", source: "c", target: "d" } },
];

function App() {
  return (
    <AppShell breadcrumbs="Behavioral / Root">
      <DiagramCanvas elements={testElements} style={cytoscapeStyle} />
    </AppShell>
  );
}

const root = document.getElementById("app");
if (root) {
  render(() => <App />, root);
}
