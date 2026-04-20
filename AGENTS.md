# Visual Code Editor — Agent Workflows

## Project Context

Interactive system visualization tool. Renders organizational (clusters → systems → modules/files/agents) and behavioral (lifecycles → stages → steps) views of a software system as Cytoscape.js graph diagrams. Users navigate by clicking cards, which either drill into sub-diagrams or open detail panels.

**This is an interpretation, control, and communication problem.** The visuals must help humans:
1. **Interpret** — understand what a node/edge means at a glance (type, status, relationships)
2. **Control** — know what's interactive, what will happen when they click, where they are in the hierarchy
3. **Communicate** — convey structure, flow, and relationships without requiring the user to read labels

### Technology Stack

- **SolidJS** + **TanStack Solid Router** — reactive UI framework
- **ELK.js** — graph layout engine (layered algorithm with orthogonal edge routing)
- **Custom SVG/HTML rendering** — nodes as HTML cards, edges as SVG paths in layered composition
- **Vite** — build tool
- **CSS custom properties** — dark theme (GitHub-dark inspired), per-node-kind accent colors

### Current Visual State (as of 2026-04-15)

35 bugs from animation QA have been fixed. Current state:
- Node shapes differentiate by type (rounded, circle, pill, hexagon, octagon)
- Hover: spring-based lift (-12px) + scale (1.08x) with accent-colored glow, 3-state settling FSM
- Edges: layered SVG composition (base/highlighted/hit/transport), innerScale compensation keeps edges connected
- Edge hover works inside compound nodes (priority refactor: non-compound > edge > compound)
- Edge colors/dash patterns working per kind (cluster, store, behavioral, back-edge, agent, file-import)
- Entry/exit animations working with stagger delays on all navigation paths
- Detail panel strips duplicate headers from fetched HTML content
- Shadowbox: playback with token animation, step progress, scenario preamble, node visit states
- Float animation pauses smoothly via animation-play-state

### Known remaining items
- Token pulse in shadowbox — needs video verification (Gemini quota)
- Edge labels only visible at zoom >= 0.8 (base) or >= 0.5 (highlighted)

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
| Visual design RCA (shadows, colors, borders, card styling) | `gemini-high` | Visual interpretation — reads screenshots, determines shades/colors, proposes CSS values |
| Animation design + parameterization | `gemini-high` | Visual reasoning for motion design |
| Communication risk review | `claude-opus` | Evaluates clarity and discoverability |
| Implementation (wiring into components — NOT visual design) | `gpt-high` | Code generation and integration |
| Algorithmic research (layout, routing, data structures) | `gpt-high` | Best at systematic algorithm analysis |
| Quick verification / builds | `glm` | Fast command execution |

### Model Boundary: Gemini vs GPT

**Gemini handles visual design** — anything involving interpreting images, determining shades/colors, proposing CSS shadow/border/gradient values, art direction, SVG creation, animation curves. Gemini reads screenshots and makes visual judgments.

**GPT handles code and algorithms** — implementation, wiring components, data pipeline, layout algorithms, edge routing strategies, architectural decisions. GPT does NOT do visual design interpretation.

The boundary: if the task requires looking at a screenshot to decide what looks right, it's Gemini. If it requires reading code to decide what's correct, it's GPT.

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

## Animation QA Workflow

Semantic animation QA using Playwright video capture + Gemini video understanding via the `agents` binary.

### How It Works

1. **Capture**: Playwright records short video clips of specific animations/interactions
2. **Judge**: `agents --model gemini-video-high` analyzes the video against expected behavior described in the prompt
3. **Human review**: Human reads Gemini's report and decides what to fix

### Running Captures

```bash
# Build and serve first
cd ~/projects/visual-code-editor
npm run build && npm run serve &

# Run all QA captures (records .webm videos to .tmp/animation-qa/captures/)
npx playwright test e2e/animation-qa-full.capture.spec.ts

# Run a single capture
npx playwright test e2e/animation-hover-lift.capture.spec.ts
```

### Sending to Gemini for QA

```bash
# Reference the video file in the prompt — gemini-video-high can read video files
agents --model gemini-video-high -p ~/projects/visual-code-editor \
  "Review the animation video at .tmp/animation-qa/captures/<dir>/<file>.webm
   <describe expected behavior>
   Report ALL visual bugs."
```

**Important model selection:**
- `gemini-video-high/medium/low` — uses `gemini` CLI, CAN process video files. Severely rate-limited. Run ONE at a time.
- `gemini-high/medium/low` — uses `droid` CLI, text/code only, CANNOT process video.
- Never run multiple gemini-video agents in parallel.

### Capture Specs

| Spec | Captures |
|------|----------|
| `e2e/animation-hover-lift.capture.spec.ts` | Single hover-lift with DOM measurements |
| `e2e/animation-qa-full.capture.spec.ts` | 10 scenarios: org overview, behavioral overview, hover lift, edge hover, drill-down, detail panel, shadowbox modal, view toggle, entry animations, floating idle |

### When to Run

- Before/after animation or interaction changes
- When investigating visual bugs
- For pre-review QA on motion-heavy PRs

Artifacts go in `.tmp/animation-qa/` (gitignored).

---

## Implementation & Bug-Fix Workflow

All code changes follow the pipeline from `~/work/AGENTS.md`:

| Step | Model | Role |
|------|-------|------|
| 1. RCA (bugs only) | `gpt-high` | Investigate root cause. Do NOT propose fixes. |
| 2. Proposal | `gpt-high` | Propose a fix/feature. Do NOT implement. |
| 3. Risk assessment | 3x `claude-opus` | Audit risk + scope risk + shortcut risk in parallel. All must be LOW. |
| 4. Research | `gpt-high` | Research hookpoints in the codebase. |
| 5. Implement | `gpt-high` | Launch implementation. |

RCA artifacts go in `.tmp/rca/` (gitignored).

### Build & Verify

```bash
# Build
cd ~/projects/visual-code-editor && npm run build

# Regenerate diagram data (into public/ so vite build includes it)
npm run regenerate

# Preview (user views on port 8742)
npm run serve

# Screenshot verification via Playwright
npx playwright test

# Animation QA verification
npx playwright test e2e/animation-qa-full.capture.spec.ts
# Then send captures to gemini-high for analysis
```

All visual changes MUST be verified on port 8742 (vite preview build), not port 3000 (dev server).

---

## Cross-Project References

- **Diagram data source**: `~/projects/agent-implementation-skill/execution-philosophy/diagrams/`
- **SVG-to-PNG conversion**: `~/projects/agent-implementation-skill/execution-philosophy/diagrams/svg_to_png.py`
- **Parent AGENTS.md** (visual creation workflows, model configs): `~/projects/agent-implementation-skill/execution-philosophy/AGENTS.md`
- **Implementation workflow**: `~/work/AGENTS.md` (Implementation & Bug-Fix Workflow section)

---

## Visual Regression

Pixel baselines live under `e2e/visual-regression.spec.ts-snapshots/` (11 scenes A–K). JetBrains Mono is bundled (`app/assets/fonts/`, wired through `@font-face` in `app/styles/theme.css`), so monospace rendering is no longer OS-dependent. DPR/rasterization still depend on the host compositor, but in practice WSL and the GitHub Actions `ubuntu-24.04` runner produce identical bytes for all 11 scenes as of commit `951a589`.

Run the harness locally:
```bash
npm run serve &          # or keep a preview open on 8742
npx playwright test e2e/visual-regression.spec.ts
```

Regenerate an approved baseline for a specific scene:
```bash
npx playwright test e2e/visual-regression.spec.ts \
  -g 'behavioral overview' --update-snapshots
```

Avoid blanket `--update-snapshots` — it silently overwrites baselines for scenes you did not mean to change. On a diff, inspect `test-results/*.png` first.

### CI (GitHub Actions)

`.github/workflows/visual-regression.yml` runs only this spec on every `pull_request`, `push` to `main`, and on-demand via `workflow_dispatch`. The workflow pins `ubuntu-24.04`, Node 20, `timeout-minutes: 20`, and uploads `test-results/` as a 7-day artifact on failure.

**If CI ever fails from rasterization drift** (e.g. after monthly Ubuntu library updates to cairo/pango/skia/freetype): refresh baselines from the runner.

1. On the Actions tab, trigger `Visual Regression` via `Run workflow` on `main` with `update_snapshots: true`.
2. When it finishes, download the `vr-baselines-ci-linux` artifact.
3. Replace the PNGs under `e2e/visual-regression.spec.ts-snapshots/` with the artifact contents, open a PR, and let the normal `pull_request` run verify green.

Do not cherry-pick a subset — if the Ubuntu runtime drifted, rebaseline all 11 scenes in one commit and visually inspect the diff for anything beyond anti-alias noise before landing.

### Known limits

- `--bg: #400000` perturbation ritual produces 10/11 RED, not 11/11 — scene K's shadowbox modal backdrop covers the body `--bg` layer. Regressions inside the modal are still caught via accent colors, text, and progress-bar treatments.
- Sans-serif (Inter) is NOT bundled; body text still falls back to the host UI font. Most VR scenes are graph-surface text that happens to render identically on WSL and Azure, but a Linux distro with a substantially different default sans would flip baselines. Bundle Inter if CI starts failing on scenes without obvious structural changes.
