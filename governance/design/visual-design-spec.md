# Visual Design Specification

Consolidated from gpt-high research on interactive graph visualization best practices.

## Node Visual Taxonomy

### Type → Visual Identity Mapping

| Type | Silhouette | Icon | Border | Fill | Ambient |
|------|-----------|------|--------|------|---------|
| cluster | Tabbed/framed card | Dashed boundary + inner boxes | Per-cluster color, 2px | `#161b22` gradient | Child-count badge pulse |
| system | Tabbed/framed card | Hexagon + inner graph | Per-system color, 2px | `#161b22` gradient | None |
| file-node | Clean slab | Document + code lines | `#58a6ff`, 2px | `#161b22` | None |
| agent-node | Hex-derived body | Robot face | `#9D7BEE`, 2px | `#1a1525` | Faint shimmer |
| store | Clean slab + barrel hint | Database cylinder | `#d29922`, 2px | `#1a1a10` | Breathing glow |
| behavioral-lifecycle | Process motif | Infinity loop | `#58a6ff`, 2.5px | `#18222d` | Orbital dot |
| behavioral-stage | Directional motif | Chevron arrow | `#4fa9a0`, 2px | `#202736` | None |
| behavioral-step | Clean slab | Crosshair/target | `#d29922`, 2px | `#251f2f` | None |
| external | Broken/outbound edge | Globe | `#30363d`, 1px dashed | `#0d1117` | None |

### Container vs Entity Visual Signals

**Containers** (cluster, system, lifecycle, stage):
- Structural drill cue: chevron, stacked-edge, or child-count badge
- Persistent inspect tab: corner nub visible at rest
- After drill: compact parent summary in child view

**Entities** (file, agent, store, step):
- Left accent bar (3px colored stripe)
- Persistent inspect affordance if detail exists
- No drill cue

**External**:
- Dashed border, reduced opacity
- No interactive affordances

## Semantic Zoom Tiers

Based on rendered pixel size (screen-space), not raw `cy.zoom()`.
Include hysteresis bands to avoid popping.

| Tier | Rendered Size | Content |
|------|--------------|---------|
| Dot | <24px | Colored dot, type shape only |
| Icon | 24-56px | Type icon + colored border |
| Label | 56-120px | Icon + short label + border |
| Full | >120px | Icon + label + inspect tab + status |

## Edge Semantics

| Edge Type | Style | Arrow | Animation |
|-----------|-------|-------|-----------|
| Data flow | Solid, 2px | Triangle | Dash flow on focus |
| Control flow | Dashed, 2px | Triangle filled | Pulse on focus |
| Dependency | Solid, 1.5px, low contrast | Triangle | None |
| Association | Dotted, 1px | None | None |
| Back-edge | Dashed, gold, unbundled-bezier | Triangle | None |

Animation only on hover/inspect/selection. Base edges stay quiet.

## Panel Architecture

### Fixed Scaffold
1. **Header**: type icon + title + breadcrumb + state + "Open diagram" (if container) + Close
2. **Summary strip**: child count, edge count, type chips, path
3. **Main modules** (collapsible):
   - Description
   - Structure/Behavior (sub-diagram preview for containers)
   - Related entities (click-to-navigate)
   - Code/Notes
4. **Actions**: navigation links, external references

### SVG Decorations
- Header crest (type-colored accent)
- Section dividers (subtle line + icon)
- Type icon medallion in header
- Status indicator pin
- Restrained — framing, not illustration

## Animation Parameters

### Hover (existing, keep)
```
lift:   { duration: 600ms, easing: cubic-bezier(0.22, 1.2, 0.36, 1), scale: 1.10, yOffset: -8px }
float:  { stiffness: 3, damping: 3.5, driftRange: { x: 3.5, y: 2.5, rotation: 0.7 } }
settle: { duration: 1200ms, easing: cubic-bezier(0, 0, 0.2, 1) }
```

### Drill Transition (new — anchored)
```
Phase 1 - Focus:   { duration: 150ms, scale: 1.05, brightness: 1.15 }
Phase 2 - Exit:    { duration: 300ms, fade: 0, drift: outward, stagger: 30ms }
Phase 3 - Move:    { duration: 400ms, easing: ease-out, target: center }
Phase 4 - Enter:   { duration: 300ms, scale: 0.8→1.0, fade: 0→1, stagger: 40ms center-out }
```

### Panel Slide (new)
```
Open:  { scrim: 200ms, slide: 300ms cubic-bezier(0.34, 1.56, 0.64, 1), content-stagger: 50ms }
Close: { total: 250ms, reverse }
```

### Type Ambient (new — very subtle)
```
store:     { border-glow: 8s ease-in-out, opacity: 0.3→0.5 }
agent:     { shimmer-scan: 12s linear, opacity: 0.05 }
lifecycle: { orbital-dot: 15s linear, dot-size: 3px }
container: { badge-pulse: 6s ease-in-out }
```

## prefers-reduced-motion

All motion animations → substitute with opacity/color transitions.
Hover lift → opacity change only, no transform.
Drill transition → instant crossfade.
Edge flow → static arrows only.
Ambient → disabled entirely.

## Implementation Priority

1. `node-visuals.ts` registry (type → frame, icon, accent, container flag, zoom tiers)
2. SVG icon assets (9 types) — refine from Gemini exploration
3. SVG card frame assets (container, entity, external variants)
4. Persistent inspect affordance on container cards
5. Restructured panel scaffold with "View sub-diagram" module
6. Compact parent summary in drilled views
7. Semantic zoom tiers with hysteresis
8. Edge stroke semantics
9. Anchored drill transitions
10. Type ambient animations
