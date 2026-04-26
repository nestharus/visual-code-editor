import {
  expect,
  test,
  type ConsoleMessage,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test';

declare global {
  interface Window {
    __slicePanelEntityClickEvents: SlicePanelEntityClickEvent[];
    __slicePanelTransitionEvents: SlicePanelTransitionEvent[];
    __resetSlicePanelEvents: () => void;
  }
}

const FIXTURE_PATH = '/e2e/fixtures/slice-panel.html';

type SliceLifecycleState =
  | 'active'
  | 'pinned'
  | 'expiring'
  | 'tombstoned'
  | 'recovered'
  | 'dismissed';

type SliceSection = 'matched' | 'neighbourhood';

interface SlicePanelEntityClickEvent {
  entityId: string;
  section: SliceSection;
}

interface SlicePanelTransitionEvent {
  toState: SliceLifecycleState;
  reason: string;
}

interface FixtureOptions {
  query?: string;
  state?: SliceLifecycleState;
  matchedCount?: number;
  neighbourhoodCount?: number;
  ttlMs?: number | null;
  resolveLabels?: boolean;
  nullLabelIndex?: number;
}

interface FixtureLoad {
  loadErrors: string[];
  root: Locator;
}

interface FixtureHandles extends FixtureLoad {
  header: Locator;
  stateBadge: Locator;
}

function fixtureUrl(baseURL: string | undefined, options: FixtureOptions = {}): string {
  const url = new URL(FIXTURE_PATH, baseURL ?? 'http://localhost:8742');

  if (options.query !== undefined) {
    url.searchParams.set('query', options.query);
  }
  if (options.state !== undefined) {
    url.searchParams.set('state', options.state);
  }
  if (options.matchedCount !== undefined) {
    url.searchParams.set('matched_count', String(options.matchedCount));
  }
  if (options.neighbourhoodCount !== undefined) {
    url.searchParams.set('neighbourhood_count', String(options.neighbourhoodCount));
  }
  if (options.ttlMs !== undefined) {
    url.searchParams.set('ttlMs', options.ttlMs === null ? 'null' : String(options.ttlMs));
  }
  if (options.resolveLabels !== undefined) {
    url.searchParams.set('resolve_labels', options.resolveLabels ? '1' : '0');
  }
  if (options.nullLabelIndex !== undefined) {
    url.searchParams.set('null_label_index', String(options.nullLabelIndex));
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
  const responseErrorReads: Promise<void>[] = [];
  const onResponse = (response: Response) => {
    if (response.status() < 400) {
      return;
    }

    responseErrorReads.push(
      response
        .text()
        .then((body) => {
          const importError =
            body.match(/Failed to resolve import[^<\n]*/)?.[0] ??
            body.match(/Internal Server Error[^<\n]*/)?.[0] ??
            body.slice(0, 160);
          loadErrors.push(`HTTP ${response.status()} ${response.url()}: ${importError}`);
        })
        .catch(() => {
          loadErrors.push(`HTTP ${response.status()} ${response.url()}`);
        }),
    );
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  await page.goto(fixtureUrl(baseURL, options));
  await Promise.all(responseErrorReads);

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('response', onResponse);

  return {
    loadErrors,
    root: page.getByTestId('slice-panel'),
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
        'SlicePanel fixture did not mount.',
        'This is expected until /app/components/slice-panel/SlicePanel.tsx exists and exports SlicePanel.',
        load.loadErrors.length > 0
          ? `Browser errors: ${load.loadErrors.join(' | ')}`
          : 'Browser errors: none captured.',
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    );
  }

  return {
    ...load,
    header: page.getByTestId('slice-panel-header'),
    stateBadge: page.getByTestId('slice-panel-state-badge'),
  };
}

function matchedRow(page: Page, index: number): Locator {
  return page.getByTestId(`slice-panel-matched-row-${index}`);
}

function neighbourhoodRow(page: Page, index: number): Locator {
  return page.getByTestId(`slice-panel-neighbourhood-row-${index}`);
}

function action(page: Page, actionName: string): Locator {
  return page.getByTestId(`slice-panel-action-${actionName}`);
}

async function resetEvents(page: Page) {
  await page.evaluate(() => window.__resetSlicePanelEvents());
}

async function entityClickEvents(page: Page): Promise<SlicePanelEntityClickEvent[]> {
  return page.evaluate(() => window.__slicePanelEntityClickEvents.slice());
}

async function transitionEvents(page: Page): Promise<SlicePanelTransitionEvent[]> {
  return page.evaluate(() => window.__slicePanelTransitionEvents.slice());
}

test.describe('SlicePanel', () => {
  test('renders header with query, lifecycle state badge, and counts', async ({
    page,
    baseURL,
  }) => {
    const { header, root, stateBadge } = await openFixture(page, baseURL, {
      query: 'auth flow',
      state: 'active',
      matchedCount: 2,
      neighbourhoodCount: 3,
    });

    await expect(root).toHaveAttribute('role', 'region');
    await expect(root).toHaveAttribute('aria-label', 'Slice auth flow');
    await expect(header).toContainText('Slice');
    await expect(header).toContainText('auth flow');
    await expect(header).toContainText('2 matched');
    await expect(header).toContainText('3 adjacent');
    await expect(stateBadge).toHaveText('active');
    await expect(stateBadge).toHaveAttribute('aria-label', 'Lifecycle: active');
    await expect(stateBadge).toHaveClass(/\bslice-state--active\b/);
  });

  test('matched section lists every matched entity id', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, {
      matchedCount: 3,
      neighbourhoodCount: 1,
    });

    await expect(page.getByRole('heading', { name: 'Matched (3)' })).toBeVisible();
    await expect(matchedRow(page, 0)).toContainText('system:matched-0');
    await expect(matchedRow(page, 1)).toContainText('system:matched-1');
    await expect(matchedRow(page, 2)).toContainText('system:matched-2');
  });

  test('neighbourhood section lists every neighbourhood entity id', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, {
      matchedCount: 1,
      neighbourhoodCount: 3,
    });

    await expect(page.getByRole('heading', { name: 'Neighbourhood (3)' })).toBeVisible();
    await expect(neighbourhoodRow(page, 0)).toContainText('module:neighbourhood-0');
    await expect(neighbourhoodRow(page, 1)).toContainText('module:neighbourhood-1');
    await expect(neighbourhoodRow(page, 2)).toContainText('module:neighbourhood-2');
  });

  test('resolveLabel displays labels and falls back to id when null', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, {
      matchedCount: 2,
      neighbourhoodCount: 1,
      resolveLabels: true,
      nullLabelIndex: 1,
    });

    await expect(matchedRow(page, 0)).toContainText('Resolved system matched 0');
    await expect(matchedRow(page, 0)).toHaveAttribute(
      'aria-label',
      'Resolved system matched 0',
    );
    await expect(matchedRow(page, 1)).toContainText('system:matched-1');
    await expect(matchedRow(page, 1)).toHaveAttribute('aria-label', 'Entity system:matched-1');
  });

  test('ACTIVE state shows Pin and Dismiss actions', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { state: 'active' });

    await expect(action(page, 'pin')).toBeVisible();
    await expect(action(page, 'dismiss')).toBeVisible();
    await expect(page.locator('[data-testid^="slice-panel-action-"]')).toHaveCount(2);
  });

  test('PINNED state shows Unpin and Dismiss actions', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { state: 'pinned', ttlMs: null });

    await expect(action(page, 'unpin')).toBeVisible();
    await expect(action(page, 'dismiss')).toBeVisible();
    await expect(page.locator('[data-testid^="slice-panel-action-"]')).toHaveCount(2);
  });

  test('TOMBSTONED state shows Recover only', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { state: 'tombstoned' });

    await expect(action(page, 'recover')).toBeVisible();
    await expect(page.locator('[data-testid^="slice-panel-action-"]')).toHaveCount(1);
  });

  test('DISMISSED state shows no action buttons', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { state: 'dismissed' });

    await expect(page.locator('[data-testid^="slice-panel-action-"]')).toHaveCount(0);
  });

  test('clicking a matched row fires onEntityClick with matched section', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, { matchedCount: 1 });
    await resetEvents(page);

    await matchedRow(page, 0).click();

    await expect.poll(() => entityClickEvents(page)).toEqual([
      {
        entityId: 'system:matched-0',
        section: 'matched',
      },
    ]);
  });

  test('clicking an action button fires onTransition with target state and reason', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, { state: 'active' });
    await resetEvents(page);

    await action(page, 'pin').click();

    await expect.poll(() => transitionEvents(page)).toEqual([
      {
        toState: 'pinned',
        reason: expect.any(String),
      },
    ]);
    expect((await transitionEvents(page))[0].reason).toMatch(/pin/i);
  });
});
