# RFC v2: DOM-Based Graph Surface — Replace Cytoscape

## Changes from v1

Revised based on opus risk assessments (both MEDIUM):

1. **Layout flash mitigated** — use default sizes from existing `CYTOSCAPE_NODE_SIZES` table for first render. Only re-layout if `ResizeObserver` reports sizes differ by >10%. No off-screen measurement pass needed for known card types.

2. **Compound node rendering specified** — parent nodes render as positioned containers with `overflow: visible`. Child nodes position relative to parent. ELK handles nested layout. DOM nesting mirrors the graph hierarchy.

3. **Neighborhood highlighting specified** — `InteractionService` manages hover state as a SolidJS signal. On hover, computes connected edges + neighbor nodes, applies `.dimmed` CSS class to non-neighbors. Same visual behavior as current `bindHighlightBehavior` but driven by signals, not Cytoscape events.

4. **Route transition specified** — on diagram change: old cards get CSS `opacity: 0` + `transform: scale(0.95)` with staggered `transition-delay` based on distance from click origin. New cards enter with `opacity: 0 → 1` + `transform: scale(0.95) → scale(1)` staggered from center outward. Total transition: ~400ms. `prefers-reduced-motion`: instant swap.

5. **Edge animation retained** — dashed edge flow animation uses CSS `stroke-dashoffset` animation on SVG paths, triggered by `.flow-active` class on hover. Same visual as current.

6. **Phase 2 "done" definition** — explicit feature parity checklist.

## Architecture (unchanged from v1)

```
GraphDefinition { nodes, edges }
        |
   LayoutService (elkjs with default sizes)
        |
   GraphSurface
   ├── GraphViewport (d3-zoom)
   │   ├── EdgeLayer (SVG)
   │   └── NodeLayer (DOM cards via CardRegistry)
   ├── InteractionService (highlight/dim signals)
   └── TransitionService (route change animations)
```

## Layout: No Flash

```typescript
// Default sizes per kind — eliminates measurement pass for known types
const DEFAULT_SIZES: Record<string, { width: number; height: number }> = {
  cluster: { width: 160, height: 80 },
  system: { width: 150, height: 70 },
  "file-node": { width: 170, height: 50 },
  "agent-node": { width: 170, height: 55 },
  store: { width: 120, height: 60 },
  "behavioral-lifecycle": { width: 210, height: 92 },
  "behavioral-stage": { width: 180, height: 74 },
  "behavioral-step": { width: 170, height: 64 },
  external: { width: 130, height: 60 },
};

// Layout pipeline:
// 1. Assign default sizes to all nodes (sync, instant)
// 2. Feed to ELK (async, ~50-200ms)
// 3. Render cards at computed positions (no flash — sizes are correct)
// 4. ResizeObserver monitors actual sizes
// 5. If any card differs by >10%, re-layout (rare, only for custom/dynamic cards)
```

## Compound Nodes

Parent nodes (clusters, module-groups) render as positioned `<div>` containers. Children render inside them with positions relative to the parent's top-left. ELK computes nested layout natively.

```tsx
<div class="graph-node compound" style={{ left, top, width, height }}>
  <div class="compound-label">{node.label}</div>
  <div class="compound-children">
    <For each={children()}>
      {(child) => <GraphNodeCard node={child} />}
    </For>
  </div>
</div>
```

CSS handles the visual: dashed border, semi-transparent background, label at top.

## Neighborhood Highlighting

```typescript
// InteractionService — SolidJS signals
const [hoveredNodeId, setHoveredNodeId] = createSignal<string | null>(null);

const dimmedNodes = createMemo(() => {
  const hovered = hoveredNodeId();
  if (!hovered) return new Set<string>();

  const neighbors = getNeighborIds(hovered, graph.edges);
  const keep = new Set([hovered, ...neighbors]);
  return new Set(graph.nodes.filter(n => !keep.has(n.id)).map(n => n.id));
});

// In NodeLayer — each card reads the signal:
<div classList={{ "graph-node": true, dimmed: dimmedNodes().has(node.id) }}>
```

CSS handles the transition: `.graph-node { transition: opacity 0.3s; }` + `.dimmed { opacity: 0.18; }`

## Route Transition

```typescript
// On diagram change:
// 1. Mark old cards with .exiting class (staggered by distance from click)
// 2. After old cards fade (300ms), swap graph data
// 3. Mark new cards with .entering class (staggered from center)
// 4. Remove .entering after animation (300ms)

// CSS:
// .graph-node.exiting { opacity: 0; transform: scale(0.95); }
// .graph-node.entering { opacity: 0; transform: scale(0.95); }
// Stagger via inline transition-delay computed from distance
```

## Phase 2 "Done" Checklist

Phase 2 is shippable when:
- [ ] Cards render at correct positions for all diagram types (org root, cluster, system, behavioral root, lifecycle, stage)
- [ ] Pan/zoom works (wheel zoom, drag pan, fit-to-bounds on load)
- [ ] Click card → navigates to sub-diagram or opens panel
- [ ] Hover card → lift animation (CSS transform + shadow)
- [ ] Hover card → neighborhood dim (non-neighbors fade)
- [ ] Hover card → edge flow animation on connected edges
- [ ] Edge labels visible, hidden at low zoom
- [ ] Semantic zoom: labels hide at small rendered sizes
- [ ] Route transitions: old cards fade out, new cards fade in
- [ ] Detail panel opens for nodes and edges
- [ ] Icons render correctly at all zoom levels
- [ ] `prefers-reduced-motion` disables animations
- [ ] Existing breadcrumbs, toolbar, view toggle work unchanged

## Migration Phases (unchanged)

1. **GraphDefinition + adapter** — additive types, zero risk
2. **GraphSurface + NodeLayer** — DOM cards, flag toggle, ~1,500 lines
3. **EdgeLayer** — SVG edges from ELK bend points
4. **Direct ELK layout** — replace mermaid-as-layout
5. **Retire Cytoscape** — delete ~2,300 lines

## File Structure (unchanged from v1)

```
app/graph/
  GraphSurface.tsx
  GraphViewport.tsx
  EdgeLayer.tsx
  NodeLayer.tsx
  EdgePath.tsx
  InteractionService.ts
  TransitionService.ts
  cards/
    CardRegistry.ts
    ClusterCard.tsx, SystemCard.tsx, FileCard.tsx, AgentCard.tsx,
    StoreCard.tsx, LifecycleCard.tsx, StageCard.tsx, StepCard.tsx,
    ExternalCard.tsx, DefaultCard.tsx
  layout/
    elk-layout.ts
    types.ts
    adapter.ts
    default-sizes.ts
  styles/
    graph-surface.css
    cards.css
    edges.css
```
