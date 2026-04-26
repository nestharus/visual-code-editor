import { expect, test, type ConsoleMessage, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    __pairedViewportEvents: number[];
    __pairedViewportChildEvents: string[];
    __resetPairedViewportEvents: () => void;
  }
}

const FIXTURE_PATH = '/e2e/fixtures/paired-viewport.html';
const DEFAULT_ARIA_LABEL = 'Paired viewport test';
const DEFAULT_LEFT_LABEL = 'Left pane';
const DEFAULT_RIGHT_LABEL = 'Right pane';
const RATIO_TOLERANCE = 0.03;
const DRAG_TOLERANCE_PX = 10;

interface FixtureOptions {
  ariaLabel?: string;
  initial?: number;
  labels?: boolean;
  leftLabel?: string;
  rightLabel?: string;
  variant?: 'basic' | 'interactive';
}

interface FixtureHandles {
  root: Locator;
  separator: Locator;
}

function fixtureUrl(baseURL: string | undefined, options: FixtureOptions = {}): string {
  const url = new URL(FIXTURE_PATH, baseURL ?? 'http://localhost:8742');

  if (options.ariaLabel) {
    url.searchParams.set('ariaLabel', options.ariaLabel);
  }
  if (options.initial !== undefined) {
    url.searchParams.set('initial', String(options.initial));
  }
  if (options.labels === false) {
    url.searchParams.set('labels', '0');
  }
  if (options.leftLabel) {
    url.searchParams.set('leftLabel', options.leftLabel);
  }
  if (options.rightLabel) {
    url.searchParams.set('rightLabel', options.rightLabel);
  }
  if (options.variant) {
    url.searchParams.set('variant', options.variant);
  }

  return url.toString();
}

async function openFixture(
  page: Page,
  baseURL: string | undefined,
  options: FixtureOptions = {},
): Promise<FixtureHandles> {
  const ariaLabel = options.ariaLabel ?? DEFAULT_ARIA_LABEL;
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

  const root = page.getByRole('region', { name: ariaLabel });
  try {
    await expect(root).toBeVisible();
  } catch (error) {
    throw new Error(
      [
        'PairedGraphViewport fixture did not mount.',
        'This is expected until /app/lib/paired-viewport/PairedGraphViewport.tsx exists and exports PairedGraphViewport.',
        loadErrors.length > 0 ? `Browser errors: ${loadErrors.join(' | ')}` : 'Browser errors: none captured.',
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    );
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }

  const separator = page.getByRole('separator', { name: /resize panes/i });
  await expect(separator).toBeVisible();

  return { root, separator };
}

function leftPane(page: Page, name = DEFAULT_LEFT_LABEL): Locator {
  return page.getByRole('group', { name });
}

function rightPane(page: Page, name = DEFAULT_RIGHT_LABEL): Locator {
  return page.getByRole('group', { name });
}

async function requireBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`${label} was not visible enough to measure.`);
  }
  return box;
}

async function currentSplitRatio(page: Page): Promise<number> {
  const left = await requireBox(leftPane(page), 'left pane');
  const right = await requireBox(rightPane(page), 'right pane');

  return left.width / (left.width + right.width);
}

async function expectRatio(page: Page, expected: number, tolerance = RATIO_TOLERANCE) {
  const actual = await currentSplitRatio(page);

  expect(
    Math.abs(actual - expected),
    `expected split ratio ${actual.toFixed(3)} to be within ${tolerance} of ${expected}`,
  ).toBeLessThanOrEqual(tolerance);
}

async function dragSeparator(page: Page, separator: Locator, deltaX: number) {
  const box = await requireBox(separator, 'split separator');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 4 });
  await page.mouse.up();
}

async function splitChangeEvents(page: Page): Promise<number[]> {
  return page.evaluate(() => window.__pairedViewportEvents.slice());
}

async function resetSplitChangeEvents(page: Page) {
  await page.evaluate(() => window.__resetPairedViewportEvents());
}

test.describe('PairedGraphViewport', () => {
  test('renders both panes', async ({ page, baseURL }) => {
    await openFixture(page, baseURL);

    await expect(page.getByTestId('L')).toBeVisible();
    await expect(page.getByTestId('R')).toBeVisible();
  });

  test('applies the default and custom initial ratios', async ({ page, baseURL }) => {
    let handles = await openFixture(page, baseURL);

    await expect(handles.separator).toHaveAttribute('aria-valuenow', '50');
    await expectRatio(page, 0.5);

    handles = await openFixture(page, baseURL, { initial: 0.3 });

    await expect(handles.separator).toHaveAttribute('aria-valuenow', '30');
    await expectRatio(page, 0.3);
  });

  test('resizes by dragging the split bar', async ({ page, baseURL }) => {
    const { separator } = await openFixture(page, baseURL);
    const before = await requireBox(leftPane(page), 'left pane before drag');

    await dragSeparator(page, separator, 100);

    const after = await requireBox(leftPane(page), 'left pane after drag');
    expect(Math.abs(after.width - before.width - 100)).toBeLessThanOrEqual(DRAG_TOLERANCE_PX);
    expect(after.width).toBeGreaterThan(before.width);
  });

  test('clamps initial ratios to the 0.1 and 0.9 constraints', async ({ page, baseURL }) => {
    let handles = await openFixture(page, baseURL, { initial: 0.05 });

    await expect(handles.separator).toHaveAttribute('aria-valuenow', '10');
    await expectRatio(page, 0.1);

    handles = await openFixture(page, baseURL, { initial: 0.95 });

    await expect(handles.separator).toHaveAttribute('aria-valuenow', '90');
    await expectRatio(page, 0.9);
  });

  test('supports keyboard nudges and Home/End jumps', async ({ page, baseURL }) => {
    const { separator } = await openFixture(page, baseURL);

    await separator.focus();
    await expect(separator).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await expect(separator).toHaveAttribute('aria-valuenow', '51');

    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await expect(separator).toHaveAttribute('aria-valuenow', '61');

    await page.keyboard.press('Home');
    await expect(separator).toHaveAttribute('aria-valuenow', '10');

    await page.keyboard.press('End');
    await expect(separator).toHaveAttribute('aria-valuenow', '90');

    await page.keyboard.press('ArrowLeft');
    await expect(separator).toHaveAttribute('aria-valuenow', '89');

    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.up('Shift');
    await expect(separator).toHaveAttribute('aria-valuenow', '79');
  });

  test('snaps to an even split with Enter or Space', async ({ page, baseURL }) => {
    let handles = await openFixture(page, baseURL, { initial: 0.72 });

    await handles.separator.focus();
    await page.keyboard.press('Enter');
    await expect(handles.separator).toHaveAttribute('aria-valuenow', '50');
    await expectRatio(page, 0.5);

    handles = await openFixture(page, baseURL, { initial: 0.33 });

    await handles.separator.focus();
    await page.keyboard.press('Space');
    await expect(handles.separator).toHaveAttribute('aria-valuenow', '50');
    await expectRatio(page, 0.5);
  });

  test('fires onSplitChange only on drag end and keyboard release', async ({ page, baseURL }) => {
    const { separator } = await openFixture(page, baseURL);
    const box = await requireBox(separator, 'split separator');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await resetSplitChangeEvents(page);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 50, startY);
    expect(await splitChangeEvents(page)).toEqual([]);
    await page.mouse.move(startX + 100, startY);
    expect(await splitChangeEvents(page)).toEqual([]);
    await page.mouse.up();

    await expect.poll(() => splitChangeEvents(page)).toHaveLength(1);
    await expectRatio(page, (await splitChangeEvents(page))[0], 0.02);

    await resetSplitChangeEvents(page);
    await separator.focus();
    await page.keyboard.down('ArrowRight');
    expect(await splitChangeEvents(page)).toEqual([]);
    await page.keyboard.up('ArrowRight');

    await expect.poll(() => splitChangeEvents(page)).toHaveLength(1);
    expect((await splitChangeEvents(page))[0]).toBeCloseTo(0.61, 2);
  });

  test('keeps the split bar between the left and right panes in tab order', async ({
    page,
    baseURL,
  }) => {
    const { separator } = await openFixture(page, baseURL);
    const leftFocus = page.getByTestId('left-focus');
    const rightFocus = page.getByTestId('right-focus');

    await leftFocus.focus();
    await expect(leftFocus).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(separator).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(rightFocus).toBeFocused();
  });

  test('exposes the required ARIA roles, labels, and separator values', async ({
    page,
    baseURL,
  }) => {
    const { root, separator } = await openFixture(page, baseURL, {
      ariaLabel: 'Slice vs. Main',
      initial: 0.42,
      leftLabel: 'Slice graph',
      rightLabel: 'Main graph',
    });

    await expect(root).toHaveAttribute('role', 'region');
    await expect(root).toHaveAttribute('aria-label', 'Slice vs. Main');
    await expect(separator).toHaveAttribute('role', 'separator');
    await expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    await expect(separator).toHaveAttribute('aria-valuenow', '42');
    await expect(separator).toHaveAttribute('aria-valuemin', '10');
    await expect(separator).toHaveAttribute('aria-valuemax', '90');
    await expect(leftPane(page, 'Slice graph')).toBeVisible();
    await expect(rightPane(page, 'Main graph')).toBeVisible();
  });

  test('renders pane headers only when labels are supplied', async ({ page, baseURL }) => {
    let handles = await openFixture(page, baseURL, { labels: false });

    await expect(handles.root.locator('header')).toHaveCount(0);

    handles = await openFixture(page, baseURL, {
      leftLabel: 'Before',
      rightLabel: 'After',
    });

    await expect(handles.root.locator('header')).toHaveCount(2);
    await expect(handles.root.locator('header').nth(0)).toHaveText('Before');
    await expect(handles.root.locator('header').nth(1)).toHaveText('After');
  });

  test('snaps instantly when reduced motion is requested', async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { separator } = await openFixture(page, baseURL, { initial: 0.8 });

    await expectRatio(page, 0.8);
    await separator.focus();
    await page.keyboard.press('Enter');

    await expect(separator).toHaveAttribute('aria-valuenow', '50');
    await expectRatio(page, 0.5, 0.02);
  });

  test('does not interfere with child focus or interactions', async ({ page, baseURL }) => {
    const { separator } = await openFixture(page, baseURL, { variant: 'interactive' });
    const leftInput = page.getByTestId('left-input');
    const rightInput = page.getByTestId('right-input');
    const leftAction = page.getByTestId('left-action');
    const rightAction = page.getByTestId('right-action');

    await leftInput.fill('abc');
    await expect(leftInput).toBeFocused();
    await expect(leftInput).toHaveValue('abc');

    await page.keyboard.press('ArrowRight');
    await expect(separator).toHaveAttribute('aria-valuenow', '50');

    await leftAction.click();
    await expect(leftAction).toBeFocused();

    await rightInput.fill('xyz');
    await expect(rightInput).toBeFocused();
    await expect(rightInput).toHaveValue('xyz');

    await rightAction.click();
    await expect(rightAction).toBeFocused();

    await expect
      .poll(() => page.evaluate(() => window.__pairedViewportChildEvents.slice()))
      .toEqual(['left:action', 'right:action']);
  });
});
