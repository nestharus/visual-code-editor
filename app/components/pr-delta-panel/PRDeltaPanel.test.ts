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
    __prDeltaPanelAddCommentEvents: PRDeltaPanelAddCommentEvent[];
    __prDeltaPanelCreateThreadEvents: PRDeltaPanelCreateThreadEvent[];
    __prDeltaPanelEntityClickEvents: PRDeltaPanelEntityClickEvent[];
    __prDeltaPanelSubmitVerdictEvents: PRDeltaPanelSubmitVerdictEvent[];
    __prDeltaPanelTransitionThreadEvents: PRDeltaPanelTransitionThreadEvent[];
    __resetPRDeltaPanelEvents: () => void;
  }
}

const FIXTURE_PATH = '/e2e/fixtures/pr-delta-panel.html';

type DeltaKind =
  | 'added'
  | 'removed'
  | 'renamed'
  | 'reshaped'
  | 'unchanged'
  | 'split'
  | 'merged'
  | 'unmatched';
type EntityKind =
  | 'behavior'
  | 'edge'
  | 'container'
  | 'store'
  | 'artifact'
  | 'widget'
  | 'test'
  | 'task';
type PaneSide = 'base' | 'head';
type ThreadStatus = 'open' | 'resolved' | 'dismissed' | 'frozen';
type VerdictDecision = 'approved' | 'changes-requested' | 'rejected';

interface PRDeltaPanelEntityClickEvent {
  side: PaneSide;
  delta: {
    deltaKind: DeltaKind;
    entityKind: EntityKind;
    baseId: string | null;
    headId: string | null;
    relatedIds: string[];
  };
}

interface PRDeltaPanelCreateThreadEvent {
  side: PaneSide;
  initialComment: string;
  delta: PRDeltaPanelEntityClickEvent['delta'];
}

interface PRDeltaPanelAddCommentEvent {
  threadId: string;
  text: string;
}

interface PRDeltaPanelTransitionThreadEvent {
  threadId: string;
  toStatus: ThreadStatus;
}

interface PRDeltaPanelSubmitVerdictEvent {
  decision: VerdictDecision;
  rationale: string;
}

interface FixtureOptions {
  added?: number;
  removed?: number;
  renamed?: number;
  reshaped?: number;
  unchanged?: number;
  split?: number;
  merged?: number;
  unmatchedBase?: number;
  unmatchedHead?: number;
  baseBranch?: string;
  headBranch?: string;
  prNumber?: number;
  showUnchanged?: boolean;
  splitRelatedCount?: number;
  mergedRelatedCount?: number;
  threads?: boolean;
  verdict?: VerdictDecision;
}

interface FixtureLoad {
  loadErrors: string[];
  root: Locator;
}

interface FixtureHandles extends FixtureLoad {
  basePane: Locator;
  counts: Locator;
  headPane: Locator;
  header: Locator;
  showUnchangedToggle: Locator;
}

function fixtureUrl(baseURL: string | undefined, options: FixtureOptions = {}): string {
  const url = new URL(FIXTURE_PATH, baseURL ?? 'http://localhost:8742');

  for (const kind of ['added', 'removed', 'renamed', 'reshaped', 'unchanged', 'split', 'merged'] as const) {
    if (options[kind] !== undefined) {
      url.searchParams.set(kind, String(options[kind]));
    }
  }

  if (options.unmatchedBase !== undefined) {
    url.searchParams.set('unmatched_base', String(options.unmatchedBase));
  }
  if (options.unmatchedHead !== undefined) {
    url.searchParams.set('unmatched_head', String(options.unmatchedHead));
  }
  if (options.baseBranch !== undefined) {
    url.searchParams.set('base_branch', options.baseBranch);
  }
  if (options.headBranch !== undefined) {
    url.searchParams.set('head_branch', options.headBranch);
  }
  if (options.prNumber !== undefined) {
    url.searchParams.set('pr_number', String(options.prNumber));
  }
  if (options.showUnchanged !== undefined) {
    url.searchParams.set('show_unchanged', options.showUnchanged ? '1' : '0');
  }
  if (options.splitRelatedCount !== undefined) {
    url.searchParams.set('split_related_count', String(options.splitRelatedCount));
  }
  if (options.mergedRelatedCount !== undefined) {
    url.searchParams.set('merged_related_count', String(options.mergedRelatedCount));
  }
  if (options.threads !== undefined) {
    url.searchParams.set('threads', options.threads ? '1' : '0');
  }
  if (options.verdict !== undefined) {
    url.searchParams.set('verdict', options.verdict);
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
    root: page.getByTestId('pr-delta-panel'),
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
        'PRDeltaPanel fixture did not mount.',
        'This is expected until /app/components/pr-delta-panel/PRDeltaPanel.tsx exists and exports PRDeltaPanel.',
        load.loadErrors.length > 0
          ? `Browser errors: ${load.loadErrors.join(' | ')}`
          : 'Browser errors: none captured.',
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    );
  }

  return {
    ...load,
    basePane: page.getByTestId('pr-delta-pane-base'),
    counts: page.getByTestId('pr-delta-counts'),
    headPane: page.getByTestId('pr-delta-pane-head'),
    header: page.getByTestId('pr-delta-header'),
    showUnchangedToggle: page.getByTestId('pr-delta-show-unchanged'),
  };
}

function row(page: Page, side: PaneSide, index: number): Locator {
  return page.getByTestId(`pr-delta-row-${side}-${index}`);
}

function chip(page: Page, side: PaneSide, index: number): Locator {
  return page.getByTestId(`pr-delta-chip-${side}-${index}`);
}

async function resetEvents(page: Page) {
  await page.evaluate(() => window.__resetPRDeltaPanelEvents());
}

async function entityClickEvents(page: Page): Promise<PRDeltaPanelEntityClickEvent[]> {
  return page.evaluate(() => window.__prDeltaPanelEntityClickEvents.slice());
}

async function addCommentEvents(page: Page): Promise<PRDeltaPanelAddCommentEvent[]> {
  return page.evaluate(() => window.__prDeltaPanelAddCommentEvents.slice());
}

async function transitionThreadEvents(page: Page): Promise<PRDeltaPanelTransitionThreadEvent[]> {
  return page.evaluate(() => window.__prDeltaPanelTransitionThreadEvents.slice());
}

async function submitVerdictEvents(page: Page): Promise<PRDeltaPanelSubmitVerdictEvent[]> {
  return page.evaluate(() => window.__prDeltaPanelSubmitVerdictEvents.slice());
}

test.describe('PRDeltaPanel', () => {
  test('renders the header with branch labels, counts, and PR number', async ({ page, baseURL }) => {
    const { counts, header } = await openFixture(page, baseURL, {
      added: 2,
      removed: 1,
      reshaped: 3,
      baseBranch: 'release/1.0',
      headBranch: 'feature/pr-delta',
      prNumber: 42,
    });

    await expect(header).toContainText('release/1.0');
    await expect(header).toContainText('feature/pr-delta');
    await expect(header).toContainText(/#?42/);
    await expect(counts).toHaveText('2 + / 1 - / 3 ~');
    await expect(counts).toHaveAttribute('role', 'status');
    await expect(counts).toHaveAttribute('aria-label', '2 added, 1 removed, 3 reshaped');
  });

  test('assigns added, removed, reshaped, and unchanged rows to the correct panes', async ({
    page,
    baseURL,
  }) => {
    const { basePane, headPane } = await openFixture(page, baseURL, {
      added: 1,
      removed: 1,
      reshaped: 1,
      unchanged: 1,
      showUnchanged: true,
    });

    await expect(basePane.getByRole('button')).toHaveCount(3);
    await expect(headPane.getByRole('button')).toHaveCount(3);
    await expect(row(page, 'base', 0)).toContainText('behavior:removed-0');
    await expect(row(page, 'base', 1)).toContainText('behavior:reshaped-0');
    await expect(row(page, 'base', 2)).toContainText('behavior:unchanged-0');
    await expect(row(page, 'head', 0)).toContainText('behavior:added-0');
    await expect(row(page, 'head', 1)).toContainText('behavior:reshaped-0');
    await expect(row(page, 'head', 2)).toContainText('behavior:unchanged-0');
  });

  test('hides unchanged rows by default', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, {
      added: 1,
      removed: 1,
      reshaped: 1,
      unchanged: 1,
    });

    await expect(page.getByRole('button', { name: /unchanged behavior behavior:unchanged-0/i })).toHaveCount(0);
  });

  test('toggles unchanged row visibility from the Show unchanged checkbox', async ({
    page,
    baseURL,
  }) => {
    const { showUnchangedToggle } = await openFixture(page, baseURL, {
      added: 1,
      removed: 1,
      reshaped: 1,
      unchanged: 1,
    });

    await expect(page.getByRole('button', { name: /unchanged behavior behavior:unchanged-0/i })).toHaveCount(0);

    await showUnchangedToggle.click();
    await expect(page.getByRole('button', { name: /unchanged behavior behavior:unchanged-0/i })).toHaveCount(2);

    await showUnchangedToggle.click();
    await expect(page.getByRole('button', { name: /unchanged behavior behavior:unchanged-0/i })).toHaveCount(0);
  });

  test('renders delta-kind chips with the contract theming classes', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, {
      added: 1,
      removed: 1,
      reshaped: 1,
      unchanged: 1,
      showUnchanged: true,
    });

    await expect(chip(page, 'base', 0)).toHaveClass(/\bdelta-chip--removed\b/);
    await expect(chip(page, 'base', 1)).toHaveClass(/\bdelta-chip--reshaped\b/);
    await expect(chip(page, 'base', 2)).toHaveClass(/\bdelta-chip--unchanged\b/);
    await expect(chip(page, 'head', 0)).toHaveClass(/\bdelta-chip--added\b/);
    await expect(chip(page, 'head', 1)).toHaveClass(/\bdelta-chip--reshaped\b/);
    await expect(chip(page, 'head', 2)).toHaveClass(/\bdelta-chip--unchanged\b/);
  });

  test('fires onEntityClick with the clicked delta and side', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, {
      added: 1,
      removed: 1,
      reshaped: 1,
    });
    await resetEvents(page);

    await row(page, 'base', 0).click();
    await row(page, 'head', 0).click();

    await expect.poll(() => entityClickEvents(page)).toEqual([
      {
        side: 'base',
        delta: expect.objectContaining({
          deltaKind: 'removed',
          entityKind: 'behavior',
          baseId: 'behavior:removed-0',
          headId: null,
        }),
      },
      {
        side: 'head',
        delta: expect.objectContaining({
          deltaKind: 'added',
          entityKind: 'behavior',
          baseId: null,
          headId: 'behavior:added-0',
        }),
      },
    ]);
  });

  test('renders SPLIT as one base row and multiple head-side rows', async ({ page, baseURL }) => {
    const { basePane, headPane } = await openFixture(page, baseURL, {
      split: 1,
      splitRelatedCount: 2,
    });

    await expect(basePane.getByRole('button')).toHaveCount(1);
    await expect(headPane.getByRole('button')).toHaveCount(3);
    await expect(row(page, 'base', 0)).toContainText('behavior:split-base-0');
    await expect(row(page, 'head', 0)).toContainText('behavior:split-head-0');
    await expect(row(page, 'head', 1)).toContainText('behavior:split-head-0-related-0');
    await expect(row(page, 'head', 2)).toContainText('behavior:split-head-0-related-1');
  });

  test('renders MERGED as multiple base-side rows and one head row', async ({ page, baseURL }) => {
    const { basePane, headPane } = await openFixture(page, baseURL, {
      merged: 1,
      mergedRelatedCount: 2,
    });

    await expect(basePane.getByRole('button')).toHaveCount(3);
    await expect(headPane.getByRole('button')).toHaveCount(1);
    await expect(row(page, 'base', 0)).toContainText('behavior:merged-base-0');
    await expect(row(page, 'base', 1)).toContainText('behavior:merged-base-0-related-0');
    await expect(row(page, 'base', 2)).toContainText('behavior:merged-base-0-related-1');
    await expect(row(page, 'head', 0)).toContainText('behavior:merged-head-0');
  });

  test('renders the base and head panes inside PairedGraphViewport slots', async ({
    page,
    baseURL,
  }) => {
    const { root } = await openFixture(page, baseURL, {
      added: 1,
      removed: 1,
    });

    const viewport = root.locator('.paired-graph-viewport');
    await expect(viewport).toBeVisible();
    await expect(viewport.getByRole('separator', { name: /resize panes/i })).toBeVisible();
    await expect(viewport.locator('.paired-graph-viewport__pane').nth(0).getByTestId('pr-delta-pane-base')).toBeVisible();
    await expect(viewport.locator('.paired-graph-viewport__pane').nth(1).getByTestId('pr-delta-pane-head')).toBeVisible();
  });

  test('sets the contract ARIA roles and labels', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, {
      added: 1,
      removed: 1,
      baseBranch: 'main',
      headBranch: 'feature/pr-delta',
    });

    await expect(page.getByRole('region', { name: /PR delta .* main to feature\/pr-delta/ })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Base entities' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Head entities' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'removed behavior behavior:removed-0' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'added behavior behavior:added-0' }),
    ).toBeVisible();
  });

  test('renders a thread indicator for entities with open review threads', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, {
      added: 1,
      removed: 1,
      threads: true,
    });

    await expect(page.getByTestId('pr-delta-thread-indicator-base-0')).toBeVisible();
    await expect(page.getByTestId('pr-delta-thread-indicator-base-0')).toContainText('2');
    await expect(page.getByTestId('pr-delta-thread-indicator-head-0')).toHaveCount(0);
  });

  test('opens an inline thread panel from the row thread indicator', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, {
      removed: 1,
      threads: true,
    });

    const indicator = page.getByTestId('pr-delta-thread-indicator-base-0');
    await expect(indicator).toBeVisible();
    await indicator.click();

    const panel = page.getByTestId('pr-delta-thread-panel-base-0');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Please verify the removal path.');
    await expect(panel).toContainText('The removed behavior still has callers.');
  });

  test('fires onAddComment from the inline thread panel', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, {
      removed: 1,
      threads: true,
    });
    await resetEvents(page);

    const indicator = page.getByTestId('pr-delta-thread-indicator-base-0');
    await expect(indicator).toBeVisible();
    await indicator.click();
    await page.getByTestId('pr-delta-thread-comment-input-base-0').fill('Reviewer follow-up.');
    await page.getByTestId('pr-delta-thread-add-comment-base-0').click();

    await expect.poll(() => addCommentEvents(page)).toEqual([
      {
        threadId: 'review:fixture-open-1',
        text: 'Reviewer follow-up.',
      },
    ]);
  });

  test('fires onTransitionThread with RESOLVED from the inline thread panel', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, {
      removed: 1,
      threads: true,
    });
    await resetEvents(page);

    const indicator = page.getByTestId('pr-delta-thread-indicator-base-0');
    await expect(indicator).toBeVisible();
    await indicator.click();
    await page.getByTestId('pr-delta-thread-resolve-base-0').click();

    await expect.poll(() => transitionThreadEvents(page)).toEqual([
      {
        threadId: 'review:fixture-open-1',
        toStatus: 'resolved',
      },
    ]);
  });

  test('renders the verdict bar with accept, request changes, and reject actions', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, {
      added: 1,
      verdict: 'changes-requested',
    });

    const verdictBar = page.getByTestId('pr-delta-verdict-bar');
    await expect(verdictBar).toBeVisible();
    await expect(verdictBar.getByRole('button', { name: 'Accept' })).toBeVisible();
    await expect(verdictBar.getByRole('button', { name: 'Request changes' })).toBeVisible();
    await expect(verdictBar.getByRole('button', { name: 'Reject' })).toBeVisible();
    await expect(verdictBar).toContainText('changes requested');
  });

  test('fires onSubmitVerdict after composing a verdict rationale', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, {
      added: 1,
    });
    await resetEvents(page);

    const verdictBar = page.getByTestId('pr-delta-verdict-bar');
    await expect(verdictBar).toBeVisible();
    await verdictBar.getByRole('button', { name: 'Request changes' }).click();
    await page.getByTestId('pr-delta-verdict-rationale').fill('Needs another review pass.');
    await page.getByTestId('pr-delta-verdict-submit').click();

    await expect.poll(() => submitVerdictEvents(page)).toEqual([
      {
        decision: 'changes-requested',
        rationale: 'Needs another review pass.',
      },
    ]);
  });
});
