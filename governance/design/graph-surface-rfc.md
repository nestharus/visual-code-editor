# RFC: DOM-Based Graph Surface — Replace Cytoscape

## Problem

The current architecture uses Cytoscape.js (2D canvas) for node rendering and DOM overlays for hover/interaction. These two rendering systems cannot match each other — icons, borders, text, shadows, and animations all behave differently between canvas and DOM states. Every visual fix requires fighting two renderers. This is a structural problem, not a tuning problem.

## Decision

Replace Cytoscape entirely with:
- **elkjs** for layout computation
- **SVG** for edge rendering
- **DOM** for card rendering
- **d3-zoom** (or equivalent) for viewport management

All in one shared coordinate system with one rendering authority.

## Architecture

```
GraphDefinition { nodes, edges }
        |
   LayoutService (elkjs)
        |
   Positioned graph { nodes with x/y, edges with bend points }
        |
   GraphSurface
   ├── GraphViewport (pan/zoom transform)
   │   ├── EdgeLayer (SVG paths in graph coords)
   │   └── NodeLayer (DOM cards in graph coords)
   └── InteractionLayer (click, hover, drag handlers)
```

### Data Model

```typescript
// Core graph types — not tied to any rendering library
type GraphNode = {
  id: string;
  kind: string;         // cluster, system, file-node, agent-node, store, etc.
  label: string;
  data: Record<string, unknown>;  // arbitrary payload for panels, AI views
  position?: { x: number; y: number };  // set by layout
  size?: { width: number; height: number };  // measured from DOM or defaults
  parent?: string;      // compound node support
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: string;         // cluster-edge, system-edge, file-import, agent-invoke, behavioral-edge
  label?: string;
  data?: Record<string, unknown>;
  bendPoints?: Array<{ x: number; y: number }>;  // from ELK
};

type GraphDefinition = {
  id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  direction?: "DOWN" | "RIGHT";  // layout direction hint
};
```

### Components

#### GraphSurface (top-level)
Replaces `DiagramCanvas.tsx`. Accepts a `GraphDefinition`, runs layout, renders the scene.

```typescript
type GraphSurfaceProps = {
  graph: GraphDefinition;
  onNodeClick?: (nodeId: string, kind: string) => void;
  onEdgeClick?: (edgeId: string, kind: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
};
```

#### GraphViewport
Owns the pan/zoom state. One CSS transform on one container element — not per-node transforms.

```typescript
// Single transform applied to the scene container
const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
```

Wheel zoom, pointer-drag pan, fit-to-bounds, minimap (later).

#### EdgeLayer
SVG `<svg>` element in graph coordinates. Edges are `<path>` elements computed from ELK bend points. Recomputed only when layout changes, not on pan/zoom (the parent transform handles zoom).

```tsx
<svg class="edge-layer" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
  <For each={edges()}>
    {(edge) => <EdgePath edge={edge} />}
  </For>
</svg>
```

#### NodeLayer
DOM cards absolutely positioned in graph coordinates. Each card is a SolidJS component looked up from the CardRegistry by `kind`.

```tsx
<div class="node-layer">
  <For each={nodes()}>
    {(node) => {
      const Card = cardRegistry[node.kind] || DefaultCard;
      return (
        <div
          class="graph-node"
          style={{
            position: "absolute",
            left: `${node.position.x}px`,
            top: `${node.position.y}px`,
            width: `${node.size.width}px`,
            height: `${node.size.height}px`,
          }}
        >
          <Card node={node} />
        </div>
      );
    }}
  </For>
</div>
```

#### CardRegistry
Maps `kind` → SolidJS component. Enables dynamic AI-composed views.

```typescript
const cardRegistry: Record<string, Component<{ node: GraphNode }>> = {
  cluster: ClusterCard,
  system: SystemCard,
  "file-node": FileCard,
  "agent-node": AgentCard,
  store: StoreCard,
  "behavioral-lifecycle": LifecycleCard,
  "behavioral-stage": StageCard,
  "behavioral-step": StepCard,
  external: ExternalCard,
  default: DefaultCard,  // fallback for AI-generated custom types
};
```

Each card component owns its own:
- Icon rendering (inline SVG)
- Border treatment (CSS)
- Hover animation (CSS transitions/keyframes)
- Click/interaction handlers
- Semantic zoom adaptation (read zoom from viewport context)

#### LayoutService
Wraps `elkjs`. Accepts a `GraphDefinition` with measured node sizes, returns positioned nodes and edge bend points.

```typescript
async function computeLayout(
  graph: GraphDefinition,
  nodeSizes: Map<string, { width: number; height: number }>,
): Promise<{ nodes: PositionedNode[]; edges: RoutedEdge[] }>;
```

Uses `ResizeObserver` on card DOM elements to get actual measured sizes, feeds them to ELK, gets back positions. Two-pass: render cards off-screen to measure, then position.

### Card Hover (CSS-only, no overlay)

Since cards are DOM elements, hover is just CSS:

```css
.graph-node {
  transition: transform 0.6s cubic-bezier(0.22, 1.2, 0.36, 1),
              box-shadow 0.6s cubic-bezier(0.22, 1.2, 0.36, 1);
}

.graph-node:hover {
  transform: translateY(-8px) scale(1.05);
  box-shadow: 0 24px 48px rgba(1, 4, 9, 0.5),
              0 12px 24px rgba(1, 4, 9, 0.4);
  z-index: 100;
}
```

No HoverOverlay. No canvas↔DOM mismatch. The same element that renders at rest also renders on hover.

### Semantic Zoom (CSS-only)

Cards read zoom from a context/signal. At low zoom, CSS classes hide details:

```css
.graph-node.zoom-dot .card-label,
.graph-node.zoom-dot .card-icon { display: none; }

.graph-node.zoom-icon .card-label { display: none; }
```

Or use CSS `container` queries based on rendered size.

### Dynamic Composition (CTRL+F / AI views)

The `GraphDefinition` model is pure data. An AI can produce:

```typescript
const searchResult: GraphDefinition = {
  id: "search-result-123",
  nodes: [
    { id: "file1", kind: "file-node", label: "auth.py", data: { matches: 3 } },
    { id: "agent1", kind: "agent-node", label: "auth-agent", data: { relevance: 0.9 } },
  ],
  edges: [
    { id: "e1", source: "file1", target: "agent1", kind: "agent-invoke", label: "invokes" },
  ],
};
```

Feed it to `<GraphSurface graph={searchResult} />` and it renders. The CardRegistry handles rendering each `kind`. Custom kinds can be added at runtime for AI-specific views.

## Migration Path

### Phase 1: GraphDefinition adapter
- Create `GraphDefinition` type alongside existing `ElementDefinition[]`
- Write adapter: `elementsTograph(elements, mermaidText) → GraphDefinition`
- No rendering changes — just the data model

### Phase 2: GraphSurface + NodeLayer
- Build `GraphSurface` component with viewport (d3-zoom)
- Render nodes as DOM cards using CardRegistry
- Use existing mermaid-computed positions initially
- Wire click/hover to existing navigation
- Mount alongside DiagramCanvas, toggle with a flag

### Phase 3: EdgeLayer
- SVG edge rendering using existing edge data
- Bezier paths from ELK bend points
- Edge labels as SVG text or positioned DOM

### Phase 4: Direct ELK layout
- Replace mermaid-as-layout with direct elkjs
- Feed measured card sizes to ELK
- Remove mermaid dependency for layout (keep for initial diagram text parsing if needed)

### Phase 5: Retire Cytoscape
- Remove DiagramCanvas.tsx
- Remove HoverOverlay.tsx
- Remove NodeActionOverlay.tsx
- Remove cytoscape-style.ts
- Remove semantic-zoom.ts (replaced by CSS container queries)
- Remove cytoscape dependency from package.json

## What This Eliminates

- Canvas↔DOM icon mismatch
- Canvas↔DOM border/shape mismatch on hover
- Canvas↔DOM text rendering differences
- Invalid Cytoscape shadow-* properties
- Invalid :not(:parent) selectors
- Percentage vs pixel icon sizing confusion
- background-fit/contain workarounds
- HoverOverlay entire component (~400 lines)
- NodeActionOverlay entire component (~140 lines)
- cytoscape-style.ts entire file (~450 lines)
- semantic-zoom.ts entire file (~100 lines)
- mermaid-layout.ts SVG parsing (~400 lines, eventually)

## File Structure

```
app/
  graph/
    GraphSurface.tsx      — top-level component
    GraphViewport.tsx     — pan/zoom with d3-zoom
    EdgeLayer.tsx         — SVG edge rendering
    NodeLayer.tsx         — DOM card positioning
    EdgePath.tsx          — individual edge path component
    cards/
      CardRegistry.ts     — kind → component mapping
      ClusterCard.tsx
      SystemCard.tsx
      FileCard.tsx
      AgentCard.tsx
      StoreCard.tsx
      LifecycleCard.tsx
      StageCard.tsx
      StepCard.tsx
      ExternalCard.tsx
      DefaultCard.tsx
    layout/
      elk-layout.ts       — elkjs wrapper
      types.ts            — GraphNode, GraphEdge, GraphDefinition
      adapter.ts          — ElementDefinition[] → GraphDefinition
    styles/
      graph-surface.css
      cards.css
      edges.css
```
