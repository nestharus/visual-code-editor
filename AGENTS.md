# AGENTS.md — Visual Code Editor
Generic routing, workflows, and conventions live in `~/ai/AGENTS.md`. This file only adds what is project-specific to visual-code-editor.

Interactive system visualization tool. Renders organizational (clusters -> systems -> modules/files/agents) and behavioral (lifecycles -> stages -> steps) views as Cytoscape.js graph diagrams. Users navigate by clicking cards, which either drill into sub-diagrams or open detail panels.
**This is an interpretation, control, and communication problem.** Visuals must help humans:
1. **Interpret** -> understand what a node/edge means at a glance.
2. **Control** -> know what's interactive, what will happen on click, and where they are in the hierarchy.
3. **Communicate** -> convey structure, flow, and relationships without requiring label reading.
## Technology Stack
SolidJS + TanStack Solid Router power the UI, ELK.js handles layered graph layout, custom SVG/HTML rendering draws cards and edges, Vite builds the app, and CSS custom properties drive the dark theme and per-node-kind accents.
## Dual-View Problem
Cards representing navigable containers (clusters, systems, lifecycles, stages) have BOTH:
- A **drill-down diagram** (click navigates to a sub-diagram).
- A **detail panel** (metadata, description, related entities).
Users need an intuitive way to access both. Current state: click always drills down; the panel is accessed via a side button that's hard to discover.
## Current Visual State
**As of 2026-04-15:** 35 animation-QA bugs fixed.
- Node shapes differentiate by type (rounded, circle, pill, hexagon, octagon).
- Hover: spring-based lift (`-12px`) + `1.08x` scale, accent glow, 3-state settling FSM.
- Edges: layered SVG composition (`base` / `highlighted` / `hit` / `transport`), innerScale compensation keeps edges connected.
- Edge hover works inside compound nodes (priority: non-compound > edge > compound).
- Edge colors and dash patterns work per kind (cluster, store, behavioral, back-edge, agent, file-import).
- Entry/exit animations run with stagger delays on all navigation paths.
- Detail panel strips duplicate headers from fetched HTML content.
- Shadowbox playback includes token animation, step progress, scenario preamble, and node visit states.
- Float animation pauses smoothly via `animation-play-state`.
**Known remaining items:**
- Token pulse in shadowbox still needs video verification (Gemini quota).
- Edge labels are only visible at zoom `>= 0.8` (base) or `>= 0.5` (highlighted).
This list is time-bound and decays. Update it as bugs close or new ones open.
## Model Roles
Generic role matrix and workflow ownership live in `~/ai/models/roles.md`. This project adds a visual-design axis the generic matrix does not cover.
| Task | Model | Why |
|---|---|---|
| Research (best practices, patterns, prior art) | `gpt-high` | Systematic analysis and synthesis |
| SVG generation + art direction | `gemini-high` | Best SVG output, visual reasoning, self-correcting loop |
| SVG iteration / quick fixes | `gemini-low` | Speed for tweaks |
| Visual design RCA (shadows, colors, borders, card styling) | `gemini-high` | Reads screenshots, determines shades/colors, proposes CSS values |
| Animation design + parameterization | `gemini-high` | Visual reasoning for motion design |
| Communication risk review | `claude-opus` | Clarity and discoverability judgment |
| Implementation (wiring into components, not visual design) | `gpt-high` | Code generation and integration |
| Algorithmic research (layout, routing, data structures) | `gpt-high` | Systematic algorithm analysis |
| Quick verification / builds | `glm` | Fast command execution |
### Gemini vs GPT Boundary
- **Gemini handles visual design** -> interpreting images, determining shades/colors, proposing CSS shadow/border/gradient values, art direction, SVG creation, animation curves.
- **GPT handles code and algorithms** -> implementation, component wiring, data pipeline, layout algorithms, edge routing strategies, architectural decisions.
- If the task requires looking at a screenshot to decide what looks right, use Gemini.
- If the task requires reading code to decide what's correct, use GPT.
- Opus still owns communication-risk, clarity, and discoverability review under the generic role matrix.
## Workflow Routing
See `~/ai/AGENTS.md` §Workflow Topologies for the generic workflow catalog.
| Cue | Project-specific workflow |
|---|---|
| Visual design / styling / card treatment / shadow tuning | Visual Design Workflow |
| SVG asset creation / SVG cleanup | SVG Self-Correcting Loop |
| Animation design / motion bugs / video review | Animation QA Workflow |
| Screenshot drift / baseline updates / diff triage | Visual Regression |
### Visual Design Workflow
Purely visual work adds a project-specific override:
1. RCA / research with `gemini-high` when screenshot judgment is required.
2. Proposal with specific CSS values, shadow depths, border treatments, or SVG direction.
3. Implementation in SVG/CSS using the self-correcting loop below.
4. Verification with Playwright screenshot or video capture plus Gemini review.
### SVG Self-Correcting Loop
Gemini generates SVGs with a built-in visual review loop. Every Gemini SVG prompt must include:
```markdown
## Self-correction workflow
1. Write the SVG to <target-path>
2. Run: python3 ~/projects/agent-implementation-skill/execution-philosophy/diagrams/svg_to_png.py <target-path> /tmp/<name>-review.png --width 800
3. Read /tmp/<name>-review.png and visually inspect
4. If elements are misaligned, overlapping, wrong color, or visually broken, fix the SVG and repeat from step 2
5. Keep iterating until the asset is clean
```
## Animation Pipeline
Gemini designs animations and figures out interpolation, selection, and parameterization.
Animation types: card hover (lift, float, settle), diagram transitions (crossfade between diagrams), edge flow (animated dashes for direction), panel slide (detail panel entrance/exit), and card type indicators (subtle ambient signals such as store pulse or agent shimmer).
Design process: `gemini-high` proposes easing curves, duration, delay, transform sequences, and rendering approach; builds a standalone prototype with the self-correcting loop; then extracts tunable parameters, defines interpolation between motion and visual states, and sets precedence when multiple animations overlap.

## Research Areas
Standing project-specific research axes:
1. **Interactive graph visualization UX** -> how tools like Figma, Miro, Lucidchart, and GitHub dependency graphs handle node-type differentiation, drill-down vs detail split, information density at different zoom levels, edge rendering, and flow indication.
2. **Card design for graph nodes** -> SVG-backed cards that signal type at a glance, show status without text, scale from `50px` to `200px+`, and work in a dark theme.
3. **Panel design for entity detail** -> present metadata alongside navigable sub-diagrams, related entities with click-to-navigate, rich content, and the dual-view problem.
4. **Animation and motion design** -> meaningful motion, orienting state transitions, `60fps` performance constraints, and `prefers-reduced-motion` accessibility.

## Animation QA Workflow
Semantic animation QA uses Playwright video capture plus Gemini video analysis through the `agents` CLI.
### Run Captures
```bash
cd ~/projects/visual-code-editor
npm run build && npm run serve &

npx playwright test e2e/animation-qa-full.capture.spec.ts

npx playwright test e2e/animation-hover-lift.capture.spec.ts
```
### Send Video to Gemini
```bash
agents --model gemini-video-high -p ~/projects/visual-code-editor \
  "Review the animation video at .tmp/animation-qa/captures/<dir>/<file>.webm
   <describe expected behavior>
   Report ALL visual bugs."
```
### Model Selection Rules
- `gemini-video-high/medium/low` uses the `gemini` CLI and can process video files.
- `gemini-high/medium/low` uses `droid`, is text/code only, and cannot process video.
- Gemini video capacity is severely rate-limited. Never run multiple `gemini-video-*` agents in parallel.
Artifacts go in `.tmp/animation-qa/` (gitignored).
### Capture Specs
| Spec | Captures |
|---|---|
| `e2e/animation-hover-lift.capture.spec.ts` | Single hover-lift with DOM measurements |
| `e2e/animation-qa-full.capture.spec.ts` | 10 scenarios: org overview, behavioral overview, hover lift, edge hover, drill-down, detail panel, shadowbox modal, view toggle, entry animations, floating idle |
### When To Run
Run before or after animation and interaction changes, during visual-bug investigation, and for pre-review QA on motion-heavy PRs.

## Visual Asset Pipeline
All visual assets are SVGs in `app/assets/` and are imported into components.
```text
app/assets/
  cards/           # SVG card frames per node type
  icons/           # type-specific icons (cluster, system, file, agent, store, etc.)
  panels/          # panel header/section decorations
  animations/      # SVG animation definitions (SMIL or CSS-driven)
  shared/          # reusable SVG fragments (gradients, filters, patterns)
```
### SVG Requirements
- Use `currentColor` for text and icon fills.
- Use CSS custom properties such as `var(--border)` and `var(--accent)` where possible.
- Optimize output: no editor metadata, no unnecessary groups.
- Make assets work at multiple sizes; card icons may render at `16px` or `48px`.
- PNG-test before commit.

## Build & Verify
```bash
cd ~/projects/visual-code-editor && npm run build
npm run regenerate
npm run serve
npx playwright test
npx playwright test e2e/animation-qa-full.capture.spec.ts
```
All visual changes must be verified on port `8742` (Vite preview build), not port `3000` (dev server).

## Cross-Project References
Diagram data source: `~/projects/agent-implementation-skill/execution-philosophy/diagrams/`. SVG-to-PNG conversion: `~/projects/agent-implementation-skill/execution-philosophy/diagrams/svg_to_png.py`.

## Visual Regression
Pixel baselines live under `e2e/visual-regression.spec.ts-snapshots/` (11 scenes A-K). JetBrains Mono and Inter (`400/500/600/700`) are bundled under `app/assets/fonts/` and wired through `@font-face` in `app/styles/theme.css`, so dominant text rendering no longer depends on the host OS font stack. DPR and rasterization still depend on the host compositor, but in practice WSL and the GitHub Actions `ubuntu-24.04` runner produced identical bytes for all 11 scenes.
### Local
```bash
npm run serve &
npx playwright test e2e/visual-regression.spec.ts
```
Regenerate a specific scene:
```bash
npx playwright test e2e/visual-regression.spec.ts \
  -g 'behavioral overview' --update-snapshots
```
Avoid blanket `--update-snapshots`. Inspect `test-results/*.png` first.
### CI
`.github/workflows/visual-regression.yml` runs on `pull_request`, `push` to `main`, and `workflow_dispatch`. It pins `ubuntu-24.04`, Node 20, a 20-minute timeout, and uploads `test-results/` as a 7-day artifact on failure.
If CI fails from rasterization drift after Ubuntu library updates to cairo, pango, skia, or freetype:
1. Trigger `Visual Regression` on `main` with `update_snapshots: true`.
2. Download the `vr-baselines-ci-linux` artifact.
3. Replace the PNGs under `e2e/visual-regression.spec.ts-snapshots/`.
4. Open a PR and let the normal `pull_request` run verify green.
Do not cherry-pick a subset. If the runner drifted, rebaseline all 11 scenes in one commit and visually inspect the diff before landing.
### Known Limits
- `--bg: #400000` perturbation produces 10/11 RED, not 11/11, because scene K's shadowbox modal backdrop covers the body `--bg` layer. Regressions inside the modal are still caught via accent colors, text, and progress-bar treatments.
- UI icons outside Inter coverage (`✕ ℹ ❯ ⏸ ⏭ ⏹ 🎬`, plus `▶` kept for consistency) render via `app/components/ControlIcon.tsx` and inline `<svg>` paths rather than font glyphs. This decouples icon rendering from fontconfig substitution on the runner.
