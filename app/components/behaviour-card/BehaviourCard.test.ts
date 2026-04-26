import { expect, test, type ConsoleMessage, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    __behaviourCardEvents: BehaviourCardFixtureEvent[];
    __resetBehaviourCardEvents: () => void;
  }
}

const FIXTURE_PATH = '/e2e/fixtures/behaviour-card.html';

type BehaviourCardMode = 'view' | 'edit';
type TrustState = 'grounded' | 'candidate' | 'conflicting' | 'stale' | 'orphaned';

interface BehaviourCardFixtureOptions {
  confirmedCount?: number;
  mode?: BehaviourCardMode;
  sliceCount?: number;
  trustState?: TrustState;
  withDescription?: boolean;
}

interface BehaviourSliceFixturePayload {
  filePath: string;
  startLine: number;
  endLine: number;
  startCol: number | null;
  endCol: number | null;
  sliceRole: string;
  discoveredBy: string;
  confirmedBy: string | null;
}

type BehaviourCardFixtureEvent =
  | { type: 'card' }
  | { type: 'chevron' }
  | { type: 'slice'; slice: BehaviourSliceFixturePayload }
  | { type: 'toggle'; next: BehaviourCardMode };

interface FixtureLoad {
  loadErrors: string[];
  root: Locator;
}

interface FixtureHandles extends FixtureLoad {
  chevron: Locator;
  description: Locator;
  editBanner: Locator;
  editRadio: Locator;
  headerLabel: Locator;
  modeToggle: Locator;
  trustBadge: Locator;
  viewRadio: Locator;
}

function fixtureUrl(baseURL: string | undefined, options: BehaviourCardFixtureOptions = {}): string {
  const url = new URL(FIXTURE_PATH, baseURL ?? 'http://localhost:8742');

  if (options.confirmedCount !== undefined) {
    url.searchParams.set('confirmedCount', String(options.confirmedCount));
  }
  if (options.mode) {
    url.searchParams.set('mode', options.mode);
  }
  if (options.sliceCount !== undefined) {
    url.searchParams.set('sliceCount', String(options.sliceCount));
  }
  if (options.trustState) {
    url.searchParams.set('trustState', options.trustState);
  }
  if (options.withDescription !== undefined) {
    url.searchParams.set('withDescription', options.withDescription ? '1' : '0');
  }

  return url.toString();
}

async function gotoFixture(
  page: Page,
  baseURL: string | undefined,
  options: BehaviourCardFixtureOptions = {},
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
    root: page.getByTestId('behaviour-card'),
  };
}

async function openFixture(
  page: Page,
  baseURL: string | undefined,
  options: BehaviourCardFixtureOptions = {},
): Promise<FixtureHandles> {
  const load = await gotoFixture(page, baseURL, options);

  try {
    await expect(load.root).toBeVisible();
  } catch (error) {
    throw new Error(
      [
        'BehaviourCard fixture did not mount.',
        'This is expected until /app/components/behaviour-card/BehaviourCard.tsx exists and exports BehaviourCard.',
        load.loadErrors.length > 0
          ? `Browser errors: ${load.loadErrors.join(' | ')}`
          : 'Browser errors: none captured.',
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    );
  }

  return {
    ...load,
    chevron: page.getByTestId('behaviour-card-chevron'),
    description: page.getByTestId('behaviour-card-description'),
    editBanner: page.getByTestId('behaviour-card-edit-banner'),
    editRadio: page.getByTestId('behaviour-card-mode-radio-edit'),
    headerLabel: page.getByTestId('behaviour-card-header-label'),
    modeToggle: page.getByTestId('behaviour-card-mode-toggle'),
    trustBadge: load.root.locator(
      '[data-testid="behaviour-card-trust-badge"], [data-testid="trust-badge"]',
    ),
    viewRadio: page.getByTestId('behaviour-card-mode-radio-view'),
  };
}

function sliceRow(page: Page, index: number): Locator {
  return page.getByTestId(`behaviour-card-slice-${index}`);
}

async function events(page: Page): Promise<BehaviourCardFixtureEvent[]> {
  return page.evaluate(() => window.__behaviourCardEvents.slice());
}

async function resetEvents(page: Page) {
  await page.evaluate(() => window.__resetBehaviourCardEvents());
}

function allZeroDurations(value: string): boolean {
  return value
    .split(',')
    .map((part) => part.trim())
    .every((part) => part === '0s' || part === '0ms');
}

async function expectChecked(radio: Locator, checked: boolean) {
  await expect(radio).toHaveAttribute('aria-checked', String(checked));
}

test.describe('BehaviourCard', () => {
  test('renders header label, description, and the configured slice rows', async ({
    page,
    baseURL,
  }) => {
    const { description, headerLabel } = await openFixture(page, baseURL, {
      sliceCount: 3,
      withDescription: true,
    });

    await expect(headerLabel).toHaveText('Checkout lifecycle');
    await expect(description).toHaveText(
      'Coordinates checkout request validation, payment authorization, and receipt emission.',
    );
    await expect(sliceRow(page, 0)).toBeVisible();
    await expect(sliceRow(page, 1)).toBeVisible();
    await expect(sliceRow(page, 2)).toBeVisible();
    await expect(sliceRow(page, 3)).toHaveCount(0);
  });

  test('renders the trust badge with the configured trust state', async ({ page, baseURL }) => {
    const { trustBadge } = await openFixture(page, baseURL, {
      trustState: 'conflicting',
    });

    await expect(trustBadge).toHaveAttribute('data-trust-state', 'conflicting');
    await expect(trustBadge).toHaveAttribute('aria-label', 'Trust: conflicting');
  });

  test('renders slice rows with role chips and file line ranges', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { sliceCount: 2 });

    await expect(sliceRow(page, 0)).toContainText('entry-point');
    await expect(sliceRow(page, 0)).toContainText('src/checkout/request.ts:12-28');
    await expect(sliceRow(page, 1)).toContainText('body');
    await expect(sliceRow(page, 1)).toContainText('src/checkout/payment.ts:41-86');
  });

  test('marks confirmed and unconfirmed slices distinctly', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { confirmedCount: 1, sliceCount: 2 });

    await expect(sliceRow(page, 0)).toHaveAttribute('data-confirmed', 'true');
    await expect(sliceRow(page, 1)).toHaveAttribute('data-confirmed', 'false');
  });

  test('defaults to view mode and toggles to edit through onToggleMode', async ({
    page,
    baseURL,
  }) => {
    const { editRadio, viewRadio } = await openFixture(page, baseURL);
    await resetEvents(page);

    await expectChecked(viewRadio, true);
    await expectChecked(editRadio, false);

    await editRadio.click();

    await expect.poll(() => events(page)).toEqual([{ type: 'toggle', next: 'edit' }]);
    await expectChecked(viewRadio, false);
    await expectChecked(editRadio, true);
  });

  test('renders the edit placeholder banner without an edit widget', async ({ page, baseURL }) => {
    const { editBanner } = await openFixture(page, baseURL, { mode: 'edit' });

    await expect(editBanner).toHaveText('Editing — D writeback machinery lands later.');
    await expect(page.getByTestId('behaviour-card-edit-widget')).toHaveCount(0);
  });

  test('clicking the card body fires onCardClick', async ({ page, baseURL }) => {
    const { root } = await openFixture(page, baseURL);
    await resetEvents(page);

    await root.click({ position: { x: 24, y: 96 } });

    await expect.poll(() => events(page)).toEqual([{ type: 'card' }]);
  });

  test('clicking the chevron fires onChevronClick without onCardClick', async ({
    page,
    baseURL,
  }) => {
    const { chevron } = await openFixture(page, baseURL);
    await resetEvents(page);

    await chevron.click();

    await expect.poll(() => events(page)).toEqual([{ type: 'chevron' }]);
  });

  test('clicking a slice fires onSliceClick with that slice without onCardClick', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, { confirmedCount: 0, sliceCount: 2 });
    await resetEvents(page);

    await sliceRow(page, 1).click();

    await expect.poll(() => events(page)).toEqual([
      {
        type: 'slice',
        slice: {
          filePath: 'src/checkout/payment.ts',
          startLine: 41,
          endLine: 86,
          startCol: null,
          endCol: null,
          sliceRole: 'body',
          discoveredBy: 'agents:slice-constructor',
          confirmedBy: null,
        },
      },
    ]);
  });

  test('clicking the mode toggle does not fire onCardClick', async ({ page, baseURL }) => {
    const { editRadio } = await openFixture(page, baseURL);
    await resetEvents(page);

    await editRadio.click();

    await expect.poll(() => events(page)).toEqual([{ type: 'toggle', next: 'edit' }]);
  });

  test('exposes article, labelledby, mode radio, and slice button ARIA semantics', async ({
    page,
    baseURL,
  }) => {
    const { editRadio, headerLabel, modeToggle, root, viewRadio } = await openFixture(page, baseURL);
    const titleId = await headerLabel.getAttribute('id');

    expect(titleId).toBeTruthy();
    await expect(root).toHaveAttribute('role', 'article');
    await expect(root).toHaveAttribute('aria-labelledby', titleId as string);
    await expect(modeToggle).toHaveAttribute('role', 'radiogroup');
    await expect(viewRadio).toHaveAttribute('role', 'radio');
    await expect(editRadio).toHaveAttribute('role', 'radio');
    await expect(sliceRow(page, 0)).toHaveAttribute('role', 'button');
    await expect(sliceRow(page, 0)).toHaveAttribute(
      'aria-label',
      'Open src/checkout/request.ts lines 12-28',
    );
  });

  test('makes the mode toggle instant under reduced motion', async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { modeToggle } = await openFixture(page, baseURL);

    const motion = await modeToggle.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        animationDuration: style.animationDuration,
        transitionDuration: style.transitionDuration,
      };
    });

    expect(allZeroDurations(motion.animationDuration)).toBe(true);
    expect(allZeroDurations(motion.transitionDuration)).toBe(true);
  });
});
