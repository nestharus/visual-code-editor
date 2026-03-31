# Visual Code Editor — Agent Workflows

## Project Context

Interactive system visualization tool. Renders organizational (clusters → systems → modules/files/agents) and behavioral (lifecycles → stages → steps) views of a software system as Cytoscape.js graph diagrams. Users navigate by clicking cards, which either drill into sub-diagrams or open detail panels.

**This is an interpretation, control, and communication problem.** The visuals must help humans:
1. **Interpret** — understand what a node/edge means at a glance (type, status, relationships)
2. **Control** — know what's interactive, what will happen when they click, where they are in the hierarchy
3. **Communicate** — convey structure, flow, and relationships without requiring the user to read labels

### Technology Stack

- **SolidJS** + **TanStack Solid Router** — reactive UI framework
- **Cytoscape.js** — graph rendering (nodes are styled via `cytoscape-style.ts`)
- **Mermaid** — layout engine (hidden render → SVG parsing → position extraction)
- **Vite** — build tool
- **CSS custom properties** — dark theme (GitHub-dark inspired)

### Current Visual State

Everything is functional but visually basic:
- Nodes are plain colored rectangles/hexagons with text labels
- No icons, no custom SVG cards, no visual hierarchy beyond color
- Hover effect: CSS-driven lift/float with spring physics (works well)
- Detail panel: plain slide-in with fetched HTML content
- No distinction between "this card opens a diagram" vs "this card opens a panel"

### Dual-View Problem

Cards that represent navigable containers (clusters, systems, lifecycles, stages) have BOTH:
- A **drill-down diagram** (clicking navigates to a sub-diagram)
- A **detail panel** (metadata, description, related entities)

Users need an intuitive way to access both. Currently, clicking always drills down; the panel is accessed via a side button that's hard to discover.

---

## Visual Asset Pipeline

All visual assets are SVGs. SVGs are version-controlled in `app/assets/` and imported into components.

### Directory Structure

```
app/assets/
  cards/           — SVG card frames per node type
  icons/           — type-specific icons (cluster, system, file, agent, store, etc.)
  panels/          — panel header/section decorations
  animations/      — SVG animation definitions (SMIL or CSS-driven)
  shared/          — reusable SVG fragments (gradients, filters, patterns)
```

### SVG Requirements

All SVGs must:
- Use `currentColor` for text/icon fills (inherits from CSS)
- Use CSS custom properties (`var(--border)`, `var(--accent)`, etc.) where possible
- Be optimized (no editor metadata, no unnecessary groups)
- Work at multiple sizes (card icons may render at 16px or 48px)
- Be tested via PNG conversion before commit

---

## Model Roles

| Task | Model | Why |
|------|-------|-----|
| Research (best practices, patterns, prior art) | `gpt-high` | Best at systematic analysis and synthesis |
| SVG generation + art direction | `gemini-high` | Best SVG output, visual reasoning, self-correcting loops |
| SVG iteration / quick fixes | `gemini-low` | Speed over polish for tweaks |
| Animation design + parameterization | `gemini-high` | Visual reasoning for motion design |
| Communication risk review | `claude-opus` | Evaluates clarity and discoverability |
| Implementation (wiring SVGs into components) | `gpt-high` | Code generation and integration |
| Quick verification / builds | `glm` | Fast command execution |

---

## SVG Self-Correcting Loop

Gemini generates SVGs with a built-in visual review loop. This eliminates the most common SVG failure modes without requiring human review of each iteration.

**Every Gemini SVG prompt must include:**

```markdown
## Self-correction workflow
1. Write the SVG to <target-path>
2. Run: python3 ~/projects/agent-implementation-skill/execution-philosophy/diagrams/svg_to_png.py <target-path> /tmp/<name>-review.png --width 800
3. Read /tmp/<name>-review.png and visually inspect
4. If elements are misaligned, overlapping, wrong color, or visually broken — fix the SVG and repeat from step 2
5. Keep iterating until the asset is clean
```

**Dispatch:**
```bash
agents --model gemini-high --file /tmp/svg-prompt.md --project ~/projects/visual-code-editor
```

---

## Animation Pipeline

Gemini designs animations and figures out interpolation, selection, and parameterization.

### Animation Types

1. **Card hover** — lift, float, settle (currently CSS transitions + JS spring physics)
2. **Diagram transitions** — crossfade between diagrams when navigating
3. **Edge flow** — animated dashes showing data/control flow direction
4. **Panel slide** — detail panel entrance/exit
5. **Card type indicators** — subtle ambient animations that signal card type (e.g., store nodes pulse, agent nodes shimmer)

### Animation Design Process

1. **Design** (`gemini-high`): Describe the interaction context. Gemini proposes animation parameters:
   - Easing curves (cubic-bezier values)
   - Duration and delay
   - Transform sequences
   - SVG SMIL vs CSS animation vs JS RAF approach

2. **Prototype** (`gemini-high`): Gemini creates a standalone HTML file with the animation for visual review. Self-correcting loop: render → screenshot → review → fix.

3. **Parameterize**: Extract animation parameters into a config object so they can be tuned without code changes:
   ```typescript
   const cardHover = {
     lift: { duration: 600, easing: [0.22, 1.2, 0.36, 1], scale: 1.10, yOffset: -8 },
     float: { stiffness: 3, damping: 3.5, driftRange: { x: 3.5, y: 2.5, rotation: 0.7 } },
     settle: { duration: 1200, easing: [0, 0, 0.2, 1] },
   };
   ```

4. **Interpolation**: For transitions between animation states, define interpolation functions:
   - Between easing curves
   - Between transform targets
   - Between shadow/glow intensities
   - Between color states

5. **Selection**: When multiple animations could apply (e.g., a card is both hovered and highlighted), define precedence and blending rules.

---

## Research Workflow

Use `gpt-high` for design research. Research prompts should:
- Reference specific comparable products/sites
- Ask for concrete patterns, not abstract principles
- Request implementation approaches, not just ideas

```bash
agents --model gpt-high --file /tmp/research-prompt.md --project ~/projects/visual-code-editor
```

### Research Areas

1. **Interactive graph visualization UX** — How do tools like Figma, Miro, Lucidchart, GitHub dependency graphs handle:
   - Node type differentiation (visual, not just color)
   - Drill-down vs detail split (cards that are both containers and entities)
   - Information density at different zoom levels
   - Edge rendering and flow indication

2. **Card design for graph nodes** — SVG-backed cards that:
   - Signal type at a glance (icon + shape + border treatment)
   - Show status/state without text
   - Scale from 50px to 200px+ gracefully
   - Work in a dark theme

3. **Panel design for entity detail** — How to present:
   - Entity metadata alongside navigable sub-diagrams
   - Related entities with click-to-navigate
   - Rich content (descriptions, code snippets, references)
   - Cards-that-have-diagrams dual view

4. **Animation and motion design** — Principles for:
   - Meaningful motion (animation that communicates, not decorates)
   - State transitions that orient the user
   - Performance constraints (60fps on mid-range hardware)
   - Accessibility (prefers-reduced-motion)

---

## Implementation Workflow

For bugs and feature work, use the RCA workflow from `~/projects/agent-implementation-skill/AGENTS.md`:

```
RCA (gpt-high) → Proposal (gpt-high) → Risk (2x claude-opus, both must be LOW) → Research+Implement (gpt-high)
```

RCA artifacts go in `.tmp/rca/` (gitignored).

### Build & Verify

```bash
# Build
cd ~/projects/visual-code-editor && npm run build

# Regenerate diagram data (into public/ so vite build includes it)
npm run regenerate
# Or manually:
# python3 src/visual_code_editor/export_json_cli.py \
#   $HOME/projects/agent-implementation-skill/execution-philosophy/diagrams/workspace.json \
#   > public/data/diagram.json

# Preview (user views on port 8742)
npm run serve

# Screenshot verification via Playwright
npx playwright test
```

### Visual Verification

All visual changes MUST be verified by screenshot on port 8742 (vite preview build), not port 3000 (dev server). Use Playwright headless browser for automated screenshots.

---

## Cross-Project References

- **Diagram data source**: `~/projects/agent-implementation-skill/execution-philosophy/diagrams/`
- **SVG-to-PNG conversion**: `~/projects/agent-implementation-skill/execution-philosophy/diagrams/svg_to_png.py`
- **Parent AGENTS.md** (visual creation workflows, model configs): `~/projects/agent-implementation-skill/execution-philosophy/AGENTS.md`
- **RCA workflow**: `~/projects/agent-implementation-skill/AGENTS.md` (System Visualization section)
