import { expect, test } from "@playwright/test";

import { setupMockApi } from "./helpers";

const LOAD_WAIT = 4000;
const MOUSE_PARK_X = 1910;
const MOUSE_PARK_Y = 10;
const POST_MOVE_SETTLE = 500;

const SCREENSHOT_OPTIONS = {
  maxDiffPixelRatio: 0.001,
  // pixelmatch YIQ sensitivity. 0.2 (Playwright default) lets hue-flips
  // pass when luminance is similar (e.g. dark-blue <-> dark-red body
  // background), which defeats the harness. 0.05 catches accent-color
  // drift while tolerating subpixel anti-alias noise.
  threshold: 0.05,
} as const;

/**
 * Visual regression harness (phase 1, local-only).
 *
 * Why this exists:
 *   Video QA and DOM assertions miss pixel drift such as shifted shadows,
 *   accent-color regressions, and broken border treatments. This spec
 *   takes full-frame PNG baselines for three high-signal UI states and
 *   fails on any per-pixel diff beyond the configured threshold.
 *
 * Pre-conditions (you must set these up before running):
 *   1. `npm run serve` must be running on port 8742 (baseURL from
 *      `playwright.config.ts`).
 *   2. The fixture at `e2e/fixtures/diagram-data.json` is the committed
 *      baseline for this harness. Any edit there will legitimately
 *      invalidate these snapshots.
 *
 * Baselines are more portable than phase 1:
 *   - JetBrains Mono is bundled, so monospace rendering no longer depends
 *     on the host OS font fallback stack.
 *   - deviceScaleFactor is Playwright's default (1). Host compositor /
 *     GPU driver changes can still shift a few subpixels.
 *   - CI adoption still requires baselining on the CI runner because
 *     rasterization remains machine-dependent even with the bundled font.
 *
 * First-run behavior:
 *   Playwright 1.59 writes a missing snapshot on first run AND fails the
 *   test. The spec is expected RED on the very first invocation on a
 *   machine; rerun immediately after baseline files appear and the suite
 *   goes GREEN. To explicitly create baselines without a red run, use:
 *     npx playwright test e2e/visual-regression.spec.ts --update-snapshots
 *
 * Targeted baseline regeneration (when an intentional visual change
 * affects only one scene):
 *   npx playwright test e2e/visual-regression.spec.ts \
 *     -g 'behavioral overview' --update-snapshots
 *   Avoid blanket `--update-snapshots` without `-g` — it will silently
 *   overwrite baselines for scenes you did not mean to change.
 *
 * On failure:
 *   Inspect `test-results/<test>/**.png` (actual, expected, diff). If the
 *   change is intentional, regenerate the specific scene with `-g`. If
 *   unintentional, fix the underlying bug before re-running.
 *
 * Fixture-ordering coupling:
 *   Selectors below key off the fixture label text (`Design`, `Alpha`).
 *   `.graph-node` elements expose only `data-kind` (see NodeLayer.tsx:142),
 *   so text-filter is the only stable DOM-level pick from this spec with
 *   no `app/**` change. If you reorder or rename entities in
 *   `e2e/fixtures/diagram-data.json`, update these selectors AND
 *   regenerate the affected baselines.
 */

test.use({ viewport: { width: 1920, height: 1080 } });

async function killAnimations(page: import("@playwright/test").Page) {
  // Unconditional kill-switch. Reduced-motion emulation handles most of
  // the app's motion (PresentationStateService, DrillTransition,
  // TransitionService, TransportStore, diagramStore, and CSS blocks),
  // but .graph-node-float has its own infinite translateY keyframe
  // without a reduced-motion gate (graph-surface.css:235). Killing all
  // animations/transitions here is cheap defense-in-depth for that plus
  // any future unguarded motion.
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;}",
  });
}

async function parkMouseAndSettle(page: import("@playwright/test").Page) {
  await page.mouse.move(MOUSE_PARK_X, MOUSE_PARK_Y, { steps: 10 });
  await page.waitForTimeout(POST_MOVE_SETTLE);
}

test.describe("visual-regression baselines", () => {
  test.beforeAll(async ({ browser, baseURL }) => {
    if (!baseURL) {
      throw new Error(
        "Font preflight failed: Playwright baseURL is undefined.",
      );
    }

    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });

    try {
      await setupMockApi(page);
      await page.goto(`${baseURL}/organizational`);
      await page
        .locator(".graph-node[data-kind='cluster']")
        .filter({ hasText: "Alpha" })
        .first()
        .waitFor({ state: "visible", timeout: 10000 });

      const fontState = await page.evaluate(async () => {
        // Chromium lazy-loads @font-face fonts when used. The overview route
        // renders no monospace text, so the bundled faces never download
        // on their own. Force-load both weights before checking so the
        // preflight fails on 404 rather than passes on "not yet needed".
        await Promise.all([
          document.fonts.load('400 1em "JetBrains Mono"'),
          document.fonts.load('500 1em "JetBrains Mono"'),
        ]);
        await document.fonts.ready;

        const jetBrainsFaces = Array.from(document.fonts)
          .filter((face) => face.family.includes("JetBrains Mono"))
          .map((face) => ({
            family: face.family,
            status: face.status,
            style: face.style,
            weight: face.weight,
          }));

        return {
          checkPassed:
            document.fonts.check('400 1em "JetBrains Mono"') &&
            document.fonts.check('500 1em "JetBrains Mono"'),
          jetBrainsFaces,
        };
      });

      if (!fontState.checkPassed) {
        throw new Error(
          `Font preflight failed: document.fonts.check for "JetBrains Mono" 400 or 500 returned false after explicit load. Faces: ${JSON.stringify(fontState.jetBrainsFaces)}.`,
        );
      }

      if (fontState.jetBrainsFaces.length === 0) {
        throw new Error(
          `Font preflight failed: document.fonts contained no faces whose family includes "JetBrains Mono". Faces: ${JSON.stringify(fontState.jetBrainsFaces)}.`,
        );
      }

      const nonLoadedFaces = fontState.jetBrainsFaces.filter(
        (face) => face.status !== "loaded",
      );

      if (nonLoadedFaces.length > 0) {
        throw new Error(
          `Font preflight failed: JetBrains Mono faces not fully loaded: ${JSON.stringify(nonLoadedFaces)}. Faces: ${JSON.stringify(fontState.jetBrainsFaces)}.`,
        );
      }
    } finally {
      await page.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  // Scene A — behavioral overview.
  // Selector keyed to lifecycle-design, the first behavioral-lifecycle in
  // the fixture (diagram-data.json:161).
  test("behavioral overview", async ({ page }) => {
    await page.goto("/behavioral");
    await page
      .locator(".graph-node[data-kind='behavioral-lifecycle']")
      .filter({ hasText: "Design" })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await killAnimations(page);
    await page.waitForTimeout(LOAD_WAIT);
    await parkMouseAndSettle(page);

    await expect(page).toHaveScreenshot(
      "behavioral-overview.png",
      SCREENSHOT_OPTIONS,
    );
  });

  // Scene B — organizational overview.
  // Selector keyed to cluster-alpha, the first cluster in the fixture
  // (diagram-data.json:5).
  test("organizational overview", async ({ page }) => {
    await page.goto("/organizational");
    await page
      .locator(".graph-node[data-kind='cluster']")
      .filter({ hasText: "Alpha" })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await killAnimations(page);
    await page.waitForTimeout(LOAD_WAIT);
    await parkMouseAndSettle(page);

    await expect(page).toHaveScreenshot(
      "organizational-overview.png",
      SCREENSHOT_OPTIONS,
    );
  });

  // Scene C — cluster detail panel.
  // Direct URL-param open (DetailPanel.tsx:77-90 uses useSearch({strict:false})).
  // Selector keyed to cluster-alpha (the first cluster) for the readiness
  // wait; the panel itself is addressed via `.detail-panel.is-open`.
  test("cluster detail panel", async ({ page }) => {
    await page.goto("/organizational?panelKind=cluster&panelId=cluster-alpha");
    await page
      .locator(".graph-node[data-kind='cluster']")
      .filter({ hasText: "Alpha" })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await killAnimations(page);
    await page.waitForTimeout(LOAD_WAIT);
    await expect(page.locator(".detail-panel.is-open")).toBeVisible();
    await parkMouseAndSettle(page);

    await expect(page).toHaveScreenshot(
      "organizational-cluster-alpha-panel.png",
      SCREENSHOT_OPTIONS,
    );
  });

  // Scene D — cluster drill-down sub-diagram.
  // Selector keyed to system-a1 ("System A1" label, the first system under
  // cluster-alpha in the fixture). Drill-down surfaces system-level nodes,
  // system-edges, and the compound-node chrome that the root organizational
  // view does not exercise.
  test("organizational cluster drill-down", async ({ page }) => {
    await page.goto("/organizational/clusters/cluster-alpha");
    await page
      .locator(".graph-node[data-kind='system']")
      .filter({ hasText: "System A1" })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await killAnimations(page);
    await page.waitForTimeout(LOAD_WAIT);
    await parkMouseAndSettle(page);

    await expect(page).toHaveScreenshot(
      "organizational-cluster-alpha-drill.png",
      SCREENSHOT_OPTIONS,
    );
  });

  // Scene E — lifecycle drill-down sub-diagram.
  // Selector keyed to stage-explore ("Explore" label, the first stage under
  // lifecycle-design in the fixture). Exercises behavioral-stage chrome and
  // behavioral edges at sub-lifecycle level.
  test("behavioral lifecycle drill-down", async ({ page }) => {
    await page.goto("/behavioral/lifecycles/lifecycle-design");
    await page
      .locator(".graph-node[data-kind='behavioral-stage']")
      .filter({ hasText: "Explore" })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await killAnimations(page);
    await page.waitForTimeout(LOAD_WAIT);
    await parkMouseAndSettle(page);

    await expect(page).toHaveScreenshot(
      "behavioral-lifecycle-design-drill.png",
      SCREENSHOT_OPTIONS,
    );
  });

  // Scene F — system drill-down sub-diagram.
  // Selector keyed to mod-group-runtime ("Runtime Core" label, a
  // module-group compound under system-a3). system-a3 is the richest
  // fixture subset and the only one to exercise module-group compound
  // chrome, agent-node, file-import edges, and agent-invoke edges — none
  // of which appear in scenes A-E.
  test("organizational system drill-down", async ({ page }) => {
    await page.goto("/organizational/clusters/cluster-alpha/systems/system-a3");
    await page
      .locator(".graph-node[data-kind='module-group']")
      .filter({ hasText: "Runtime Core" })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await killAnimations(page);
    await page.waitForTimeout(LOAD_WAIT);
    await parkMouseAndSettle(page);

    await expect(page).toHaveScreenshot(
      "organizational-system-a3-drill.png",
      SCREENSHOT_OPTIONS,
    );
  });

  // Scene G — UI-exploration root.
  // Selector keyed to ui-screen-org ("Organizational Overview" label, the
  // first ui-screen in the fixture). /ui is the third top-level view
  // alongside /organizational and /behavioral (commit 06f44ec). Exercises
  // ui-screen chrome distinct from cluster/lifecycle cards.
  test("ui exploration overview", async ({ page }) => {
    await page.goto("/ui");
    await page
      .locator(".graph-node[data-kind='ui-screen']")
      .filter({ hasText: "Organizational Overview" })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await killAnimations(page);
    await page.waitForTimeout(LOAD_WAIT);
    await parkMouseAndSettle(page);

    await expect(page).toHaveScreenshot(
      "ui-exploration-overview.png",
      SCREENSHOT_OPTIONS,
    );
  });

  // Scene H — UI screen drill-down.
  // Selector keyed to ui-component-view-toggle ("View Toggle" label under
  // ui-screen-org). Only scene that renders ui-component chrome and
  // ui-implements edge kind — unique to the UI-exploration view.
  test("ui exploration screen drill-down", async ({ page }) => {
    await page.goto("/ui/screens/ui-screen-org");
    await page
      .locator(".graph-node[data-kind='ui-component']")
      .filter({ hasText: "View Toggle" })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await killAnimations(page);
    await page.waitForTimeout(LOAD_WAIT);
    await parkMouseAndSettle(page);

    await expect(page).toHaveScreenshot(
      "ui-exploration-screen-org-drill.png",
      SCREENSHOT_OPTIONS,
    );
  });

  // Scene I — stage drill-down sub-diagram.
  // Selector keyed to step-code ("Code" label under stage-implement). Only
  // scene that renders behavioral-step chrome and the behavioral-back-edge
  // kind (Debug -> Code in the fixture) — a dashed style distinct from the
  // forward behavioral-edge rendered in scene E.
  test("behavioral stage drill-down", async ({ page }) => {
    await page.goto("/behavioral/lifecycles/lifecycle-build/stages/stage-implement");
    await page
      .locator(".graph-node[data-kind='behavioral-step']")
      .filter({ hasText: "Code" })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await killAnimations(page);
    await page.waitForTimeout(LOAD_WAIT);
    await parkMouseAndSettle(page);

    await expect(page).toHaveScreenshot(
      "behavioral-stage-implement-drill.png",
      SCREENSHOT_OPTIONS,
    );
  });

  // Scene J — file detail panel with code block.
  // Only scene that renders .detail-code-header + .detail-code-pre, which
  // exercise font-weight 400 (code body) and font-weight 500 (.detail-code-path)
  // in "JetBrains Mono". Other panel scenes (C) open entities that have no
  // code blocks, so the bundled monospace face is never hit there. This scene
  // is what actually verifies that the vendored .woff2 reaches pixels.
  // URL opens file-entry.ts from inside the system-a3 drill-down — see
  // fixtures/diagram-data.json:517-532 (code.byEntity["file-entry.ts"] ->
  // cb-entry-bootstrap).
  test("file panel with code block", async ({ page }) => {
    await page.goto(
      "/organizational/clusters/cluster-alpha/systems/system-a3?panelKind=file&panelId=file-entry.ts",
    );
    // Wait for the enclosing module-group compound (same pattern as scene F)
    // rather than the inner file node, because the file nodes render as
    // descendants of the module-group and are not reliably resolved as
    // top-level .graph-node locators during the initial drill-down layout.
    await page
      .locator(".graph-node[data-kind='module-group']")
      .filter({ hasText: "Runtime Core" })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await killAnimations(page);
    await page.waitForTimeout(LOAD_WAIT);
    await expect(page.locator(".detail-panel.is-open")).toBeVisible();
    await expect(page.locator(".detail-code-pre").first()).toBeVisible();
    await parkMouseAndSettle(page);

    await expect(page).toHaveScreenshot(
      "file-entry-panel-code-block.png",
      SCREENSHOT_OPTIONS,
    );
  });

  // Scene K — shadowbox modal in paused state at beat 1.
  // Only scene that exercises ShadowboxModal chrome: backdrop, shell,
  // caption title, step-count subtitle, progress bar, beat caption text,
  // and playback controls (play/pause toggle, step button, speed select).
  // BehaviorPlayback.start() synchronously sets status to "playing" before
  // the modal mounts (BehaviorPlayback.ts:148-149), so the preamble state
  // (idle|loading at ShadowboxModal.tsx:73) is unreachable via the normal
  // Play button flow. We pause immediately after starting so the progress
  // bar and ScenarioBox are frozen on the first beat — the only stable
  // in-modal state that also renders the full progress row.
  // Entry point: the Play button for the "Alpha Data Flow" scenario
  // (behaviorId: lifecycle-design), selected via the data-scenario-id
  // attribute added to DetailPanel.tsx so the button is reachable without
  // relying on the hasText filter.
  test("shadowbox modal paused at beat 1", async ({ page }) => {
    await page.goto("/organizational?panelKind=cluster&panelId=cluster-alpha");
    await page
      .locator(".graph-node[data-kind='cluster']")
      .filter({ hasText: "Alpha" })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await killAnimations(page);
    await page.waitForTimeout(LOAD_WAIT);
    await expect(page.locator(".detail-panel.is-open")).toBeVisible();
    await page
      .locator(".detail-behavior-play[data-scenario-id='lifecycle-design']")
      .click();
    await expect(page.locator(".shadowbox-modal-shell")).toBeVisible();
    // Pause so the progress bar / caption text / beat index are stable.
    // The first .playback-btn is the play/pause toggle (title="Pause"
    // when status is "playing"); clicking it calls playback.pause().
    await page.locator(".playback-btn[title='Pause']").click();
    await expect(page.locator(".shadowbox-modal-progress")).toBeVisible();
    await killAnimations(page);
    await page.waitForTimeout(LOAD_WAIT);
    await parkMouseAndSettle(page);

    await expect(page).toHaveScreenshot(
      "shadowbox-modal-paused.png",
      SCREENSHOT_OPTIONS,
    );
  });
});
