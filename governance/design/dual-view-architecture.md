# Dual-View Architecture: Cards with Diagrams and Panels

## Decision

Use **embedded parent detail + persistent inspect affordance** pattern.

Based on research across Figma, Notion, GitHub, Google Maps, VS Code, Miro, and Linear:
the successful pattern is not "teach a hidden alternate gesture" but "keep navigation fast
and make detail visible in parallel or immediately after entry."

## Interaction Model

### Card Interactions (pre-drill)
- **Card body click/tap** = drill down to sub-diagram (primary action, one click)
- **Inspect tab click/tap** = open detail panel without navigation
- **Right-click / long-press** = context menu with "Open Diagram" and "Open Details"
- **Keyboard**: Enter = drill, i/Space = open details

### After Drill-Down
- Show compact parent summary ("About this Cluster/System/...") as a header or
  collapsible rail in the sub-diagram view
- Expanding it opens the full detail panel
- Users learn naturally that containers have both diagrams and details

### Zoom-Level Adaptations
- **Large cards (>120px rendered)**: persistent inspect tab with text label ("Info")
- **Medium cards (56-120px)**: persistent inspect tab with icon only
- **Small cards (24-56px)**: no in-card affordance; selection exposes Open/Details in fixed HUD
- **Tiny cards (<24px)**: dot only; selection required for any action

## Visual Treatment

### Drill Signal (container cards only)
- Chevron, depth notch, stacked-edge treatment, or child-count badge
- Must signal "you can go deeper" without text

### Inspect Signal (cards with detail)
- Persistent corner tab or side nub — NOT a floating hover button
- Visible at rest (before hover), becomes more legible on hover/focus
- Must be touch-safe (minimum 24x24px hit area)

### Shared Visual Language
- Inspect tab and drilled-view parent summary share the same visual styling
- Panel feels like a natural extension of the card, not a separate feature

## Sources
- Figma: selection exposes properties in sidebar; Enter to go inside
- Notion: page content and subpage hierarchy in same experience
- GitHub: code navigation + ambient metadata (README, About) on same page
- Google Maps: compact place card alongside map
- Linear: project overview and details sidebar coexist
- Miro: selection exposes menus; frames panel for navigation
