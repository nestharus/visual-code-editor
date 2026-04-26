import { expect, test, type ConsoleMessage, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    __floatingComposerAnchorRect: PlainRect | null;
    __floatingComposerCloseEvents: string[];
    __floatingComposerSubmissions: ComposerSubmissionEvent[];
    __resetFloatingComposerEvents: () => void;
  }
}

const FIXTURE_PATH = '/e2e/fixtures/floating-composer.html';
const PLACEMENT_GAP = 12;
const POSITION_TOLERANCE_PX = 3;

type ComposerMode = 'ask' | 'edit' | 'direct';
type AnchorKind =
  | 'node'
  | 'edge'
  | 'code-block'
  | 'section'
  | 'behaviour-card'
  | 'task'
  | 'pr-delta'
  | 'selection-box'
  | 'slice'
  | 'screen'
  | 'widget';

interface PlainRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface ComposerSubmissionEvent {
  mode: ComposerMode;
  prompt: string;
  selection: {
    items: Array<{ id: string; kind: AnchorKind; mode: 'entity' | 'contents' }>;
    primaryAnchor: AnchorKind | null;
  };
  surfaceAnchor: AnchorKind;
}

interface FixtureOptions {
  anchor?: 'default' | 'above-right' | 'above-left' | 'below-left' | 'pin' | 'none';
  enabledModes?: readonly ComposerMode[];
  mode?: ComposerMode;
  open?: boolean;
  prompt?: string;
  selectionIds?: readonly string[];
  selectionKind?: AnchorKind;
  surfaceAnchor?: AnchorKind;
}

interface FixtureLoad {
  loadErrors: string[];
  root: Locator;
}

interface FixtureHandles extends FixtureLoad {
  anchorInfoRow: Locator;
  closeButton: Locator;
  directPill: Locator;
  editPill: Locator;
  promptInput: Locator;
  root: Locator;
  askPill: Locator;
  submitButton: Locator;
}

function fixtureUrl(baseURL: string | undefined, options: FixtureOptions = {}): string {
  const url = new URL(FIXTURE_PATH, baseURL ?? 'http://localhost:8742');

  if (options.anchor) {
    url.searchParams.set('anchor', options.anchor);
  }
  if (options.enabledModes) {
    url.searchParams.set('enabledModes', options.enabledModes.join(','));
  }
  if (options.mode) {
    url.searchParams.set('mode', options.mode);
  }
  if (options.open !== undefined) {
    url.searchParams.set('open', String(options.open));
  }
  if (options.prompt !== undefined) {
    url.searchParams.set('prompt', options.prompt);
  }
  if (options.selectionIds) {
    url.searchParams.set('selectionIds', options.selectionIds.join(','));
  }
  if (options.selectionKind) {
    url.searchParams.set('selectionKind', options.selectionKind);
  }
  if (options.surfaceAnchor) {
    url.searchParams.set('surfaceAnchor', options.surfaceAnchor);
  }

  return url.toString();
}

async function gotoFixture(
  page: Page,
  baseURL: string | undefined,
  options: FixtureOptions = {},
): Promise<FixtureLoad> {
  const loadErrors: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      loadErrors.push(message.text());
    }
  };
  const onPageError = (error: Error) => {
    loadErrors.push(error.message);
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  await page.goto(fixtureUrl(baseURL, options));

  page.off('console', onConsole);
  page.off('pageerror', onPageError);

  return {
    loadErrors,
    root: page.getByTestId('floating-composer'),
  };
}

async function openFixture(
  page: Page,
  baseURL: string | undefined,
  options: FixtureOptions = {},
): Promise<FixtureHandles> {
  const load = await gotoFixture(page, baseURL, options);

  try {
    await expect(load.root).toBeVisible();
  } catch (error) {
    throw new Error(
      [
        'FloatingComposer fixture did not mount.',
        'This is expected until /app/components/floating-composer/FloatingComposer.tsx exists and exports FloatingComposer.',
        load.loadErrors.length > 0
          ? `Browser errors: ${load.loadErrors.join(' | ')}`
          : 'Browser errors: none captured.',
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    );
  }

  if (options.prompt !== undefined) {
    await expect(page.getByTestId('prompt-input')).toHaveValue(options.prompt);
  }

  return {
    ...load,
    anchorInfoRow: page.getByTestId('anchor-info-row'),
    askPill: page.getByTestId('mode-pill-ask'),
    closeButton: page.getByTestId('close-button'),
    directPill: page.getByTestId('mode-pill-direct'),
    editPill: page.getByTestId('mode-pill-edit'),
    promptInput: page.getByTestId('prompt-input'),
    submitButton: page.getByTestId('submit-button'),
  };
}

async function requireBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`${label} was not visible enough to measure.`);
  }
  return box;
}

async function anchorRect(page: Page): Promise<PlainRect> {
  const rect = await page.evaluate(() => window.__floatingComposerAnchorRect);
  if (rect === null) {
    throw new Error('fixture did not expose an anchor rect');
  }
  return rect;
}

async function submissions(page: Page): Promise<ComposerSubmissionEvent[]> {
  return page.evaluate(() => window.__floatingComposerSubmissions.slice());
}

async function closeEvents(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__floatingComposerCloseEvents.slice());
}

async function resetEvents(page: Page) {
  await page.evaluate(() => window.__resetFloatingComposerEvents());
}

async function expectNoLoadErrors(load: FixtureLoad) {
  expect(load.loadErrors, `Browser errors: ${load.loadErrors.join(' | ')}`).toEqual([]);
}

function expectCloseTo(actual: number, expected: number, label: string) {
  expect(Math.abs(actual - expected), `${label}: expected ${actual} to be close to ${expected}`)
    .toBeLessThanOrEqual(POSITION_TOLERANCE_PX);
}

async function expectChecked(pill: Locator, checked: boolean) {
  await expect(pill).toHaveAttribute('aria-checked', String(checked));
}

test.describe('FloatingComposer', () => {
  test('renders only when open=true with anchorRect', async ({ page, baseURL }) => {
    const handles = await openFixture(page, baseURL, { open: true });
    await expect(handles.root).toBeVisible();

    let load = await gotoFixture(page, baseURL, { open: false });
    await expectNoLoadErrors(load);
    await expect(load.root).toHaveCount(0);

    load = await gotoFixture(page, baseURL, { anchor: 'none', open: true });
    await expectNoLoadErrors(load);
    await expect(load.root).toHaveCount(0);
  });

  test('renders the mode selector in order and updates the checked mode on click', async ({
    page,
    baseURL,
  }) => {
    const { askPill, editPill, directPill } = await openFixture(page, baseURL, {
      mode: 'edit',
    });

    await expect(askPill).toHaveText(/ask/i);
    await expect(editPill).toHaveText(/edit/i);
    await expect(directPill).toHaveText(/direct/i);
    await expectChecked(askPill, false);
    await expectChecked(editPill, true);
    await expectChecked(directPill, false);

    await directPill.click();

    await expectChecked(askPill, false);
    await expectChecked(editPill, false);
    await expectChecked(directPill, true);
  });

  test('keeps disabled modes out of focus and defaults to the first enabled mode', async ({
    page,
    baseURL,
  }) => {
    const { askPill, editPill, directPill, closeButton, promptInput, submitButton } =
      await openFixture(page, baseURL, {
        enabledModes: ['edit'],
        mode: 'direct',
        prompt: 'ready',
      });

    await expectChecked(askPill, false);
    await expectChecked(editPill, true);
    await expectChecked(directPill, false);
    await expect(askPill).toBeDisabled();
    await expect(directPill).toBeDisabled();

    await directPill.click({ force: true });
    await expectChecked(editPill, true);
    await expectChecked(directPill, false);

    await promptInput.focus();
    await page.keyboard.press('Tab');
    await expect(submitButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(editPill).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(closeButton).toBeFocused();
  });

  test('focuses the prompt on open and auto-grows it to an 8-line cap', async ({
    page,
    baseURL,
  }) => {
    const { promptInput } = await openFixture(page, baseURL);
    await expect(promptInput).toBeFocused();

    const oneLine = await requireBox(promptInput, 'one-line prompt');
    await promptInput.fill('one\ntwo');
    const twoLines = await requireBox(promptInput, 'two-line prompt');
    expect(twoLines.height).toBeGreaterThan(oneLine.height);

    await promptInput.fill(Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join('\n'));
    const twelveLines = await requireBox(promptInput, 'twelve-line prompt');
    expect(twelveLines.height).toBeLessThanOrEqual(oneLine.height * 8.75);

    const overflow = await promptInput.evaluate((textarea) => ({
      clientHeight: textarea.clientHeight,
      scrollHeight: textarea.scrollHeight,
    }));
    expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);
  });

  test('submits with Cmd+Enter and Ctrl+Enter while plain Enter inserts a newline', async ({
    page,
    baseURL,
  }) => {
    const { editPill, promptInput } = await openFixture(page, baseURL, {
      selectionIds: ['node-alpha', 'edge-beta'],
      selectionKind: 'node',
      surfaceAnchor: 'edge',
    });

    await editPill.click();
    await promptInput.fill('first line');
    await page.keyboard.press('Enter');
    await expect(promptInput).toHaveValue('first line\n');
    expect(await submissions(page)).toEqual([]);

    await page.keyboard.press('Control+Enter');
    await expect.poll(() => submissions(page)).toHaveLength(1);

    await promptInput.fill('second prompt');
    await page.keyboard.down('Meta');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Meta');

    await expect.poll(() => submissions(page)).toHaveLength(2);
    expect(await submissions(page)).toEqual([
      {
        mode: 'edit',
        prompt: 'first line\n',
        selection: {
          items: [
            { id: 'node-alpha', kind: 'node', mode: 'entity' },
            { id: 'edge-beta', kind: 'node', mode: 'entity' },
          ],
          primaryAnchor: 'node',
        },
        surfaceAnchor: 'edge',
      },
      {
        mode: 'edit',
        prompt: 'second prompt',
        selection: {
          items: [
            { id: 'node-alpha', kind: 'node', mode: 'entity' },
            { id: 'edge-beta', kind: 'node', mode: 'entity' },
          ],
          primaryAnchor: 'node',
        },
        surfaceAnchor: 'edge',
      },
    ]);
  });

  test('disables the submit button for empty and whitespace-only prompts', async ({
    page,
    baseURL,
  }) => {
    const { promptInput, submitButton } = await openFixture(page, baseURL);

    await expect(submitButton).toBeDisabled();
    await promptInput.fill('   \n\t ');
    await expect(submitButton).toBeDisabled();
    await promptInput.fill('send this');
    await expect(submitButton).toBeEnabled();
  });

  test('clears the prompt after submit and stays open', async ({ page, baseURL }) => {
    const { promptInput, root, submitButton } = await openFixture(page, baseURL);

    await promptInput.fill('keep composer open');
    await submitButton.click();

    await expect.poll(() => submissions(page)).toHaveLength(1);
    await expect(promptInput).toHaveValue('');
    await expect(root).toBeVisible();
  });

  test('calls onClose when Escape is pressed', async ({ page, baseURL }) => {
    const { promptInput, root } = await openFixture(page, baseURL);
    await resetEvents(page);

    await promptInput.focus();
    await page.keyboard.press('Escape');

    await expect.poll(() => closeEvents(page)).toEqual(['close']);
    await expect(root).toHaveCount(0);
  });

  test('calls onClose when the user clicks outside the composer', async ({ page, baseURL }) => {
    const { root } = await openFixture(page, baseURL);
    await resetEvents(page);

    await page.getByTestId('outside-target').click();

    await expect.poll(() => closeEvents(page)).toEqual(['close']);
    await expect(root).toHaveCount(0);
  });

  test('positions near the anchor, uses fallback placements, and pins when no placement fits', async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 800, height: 600 });

    const cases: Array<{
      anchor: NonNullable<FixtureOptions['anchor']>;
      assertPlacement: (composer: Awaited<ReturnType<typeof requireBox>>, anchor: PlainRect) => void;
    }> = [
      {
        anchor: 'default',
        assertPlacement: (composer, anchor) => {
          expectCloseTo(composer.x, anchor.right + PLACEMENT_GAP, 'default x');
          expectCloseTo(composer.y, anchor.bottom + PLACEMENT_GAP, 'default y');
        },
      },
      {
        anchor: 'above-right',
        assertPlacement: (composer, anchor) => {
          expectCloseTo(composer.x, anchor.right + PLACEMENT_GAP, 'above-right x');
          expectCloseTo(composer.y + composer.height, anchor.top - PLACEMENT_GAP, 'above-right y');
        },
      },
      {
        anchor: 'above-left',
        assertPlacement: (composer, anchor) => {
          expectCloseTo(composer.x + composer.width, anchor.left - PLACEMENT_GAP, 'above-left x');
          expectCloseTo(composer.y + composer.height, anchor.top - PLACEMENT_GAP, 'above-left y');
        },
      },
      {
        anchor: 'below-left',
        assertPlacement: (composer, anchor) => {
          expectCloseTo(composer.x + composer.width, anchor.left - PLACEMENT_GAP, 'below-left x');
          expectCloseTo(composer.y, anchor.bottom + PLACEMENT_GAP, 'below-left y');
        },
      },
      {
        anchor: 'pin',
        assertPlacement: (composer) => {
          expectCloseTo(composer.x + composer.width, 800, 'pinned x');
          expectCloseTo(composer.y + composer.height, 600, 'pinned y');
        },
      },
    ];

    for (const testCase of cases) {
      const { root } = await openFixture(page, baseURL, { anchor: testCase.anchor });
      const composer = await requireBox(root, `${testCase.anchor} composer`);
      const anchor = await anchorRect(page);

      testCase.assertPlacement(composer, anchor);
      expect(composer.x).toBeGreaterThanOrEqual(0);
      expect(composer.y).toBeGreaterThanOrEqual(0);
      expect(composer.x + composer.width).toBeLessThanOrEqual(800);
      expect(composer.y + composer.height).toBeLessThanOrEqual(600);
    }
  });

  test('traps focus inside the composer in both tab directions', async ({ page, baseURL }) => {
    const { askPill, closeButton, promptInput, submitButton } = await openFixture(page, baseURL, {
      prompt: 'ready',
    });

    await expect(promptInput).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(submitButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(askPill).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(closeButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(promptInput).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await expect(closeButton).toBeFocused();
  });

  test('exposes dialog and mode-selector ARIA semantics', async ({ page, baseURL }) => {
    const { askPill, directPill, editPill, promptInput, root } = await openFixture(page, baseURL, {
      mode: 'direct',
    });
    const modeSelector = root.locator('[role="radiogroup"]');

    await expect(root).toHaveAttribute('role', 'dialog');
    await expect(root).toHaveAttribute('aria-modal', 'true');
    await expect(root).toHaveAttribute('aria-label', 'Prompt composer');
    await expect(modeSelector).toBeVisible();
    await expect(askPill).toHaveAttribute('role', 'radio');
    await expect(editPill).toHaveAttribute('role', 'radio');
    await expect(directPill).toHaveAttribute('role', 'radio');
    await expectChecked(directPill, true);
    await expect(promptInput).toHaveAttribute('aria-label', 'Prompt');
  });

  test('skips open transitions when reduced motion is requested', async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { root } = await openFixture(page, baseURL);

    const motion = await root.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        animationDuration: style.animationDuration,
        transitionDuration: style.transitionDuration,
      };
    });

    const allZeroDurations = (value: string) =>
      value
        .split(',')
        .map((part) => part.trim())
        .every((part) => part === '0s' || part === '0ms');

    expect(allZeroDurations(motion.animationDuration)).toBe(true);
    expect(allZeroDurations(motion.transitionDuration)).toBe(true);
  });

  test('summarizes mode, surface anchor, selection count, and selection ids', async ({
    page,
    baseURL,
  }) => {
    const cases: Array<{
      expected: RegExp;
      options: FixtureOptions;
    }> = [
      {
        options: {
          mode: 'ask',
          selectionIds: [],
          surfaceAnchor: 'code-block',
        },
        expected: /Asking about[\s\S]*code block[\s\S]*0 items/,
      },
      {
        options: {
          mode: 'edit',
          selectionIds: ['stage-intake'],
          surfaceAnchor: 'behaviour-card',
        },
        expected: /Editing[\s\S]*behaviour card[\s\S]*1 item[\s\S]*stage-intake/,
      },
      {
        options: {
          mode: 'direct',
          selectionIds: ['task-1', 'task-2', 'task-3'],
          selectionKind: 'task',
          surfaceAnchor: 'task',
        },
        expected: /Directing[\s\S]*Task[\s\S]*3 items[\s\S]*task-1[\s\S]*task-2[\s\S]*task-3/,
      },
    ];

    for (const testCase of cases) {
      const { anchorInfoRow } = await openFixture(page, baseURL, testCase.options);
      await expect(anchorInfoRow).toHaveText(testCase.expected);
      await expect(anchorInfoRow).not.toBeFocused();
      await expect(anchorInfoRow).not.toHaveAttribute('tabindex', /0/);
    }
  });
});
