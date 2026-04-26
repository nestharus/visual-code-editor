import { expect, test, type ConsoleMessage, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    __behaviourCardEvents: BehaviourCardFixtureEvent[];
    __behaviourCardGetSliceTextCalls: BehaviourCardGetSliceTextCall[];
    __behaviourCardSliceTextByIndex: string[];
    __resetBehaviourCardEvents: () => void;
    __resetBehaviourCardGetSliceTextCalls: () => void;
  }
}

const FIXTURE_PATH = '/e2e/fixtures/behaviour-card.html';

type BehaviourCardMode = 'view' | 'edit';
type TrustState = 'grounded' | 'candidate' | 'conflicting' | 'stale' | 'orphaned';

interface BehaviourCardFixtureOptions {
  confirmedCount?: number;
  parentRevision?: string;
  mode?: BehaviourCardMode;
  sliceCount?: number;
  sliceTexts?: string[];
  trustState?: TrustState;
  withGetSliceText?: boolean;
  withDescription?: boolean;
  withPromoteCallback?: boolean;
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
  | { type: 'toggle'; next: BehaviourCardMode }
  | { type: 'promote'; behaviour: unknown }
  | { type: 'saved'; plan: unknown }
  | { type: 'conflict'; conflict: unknown }
  | { type: 'error'; error: unknown };

interface BehaviourCardGetSliceTextCall {
  index: number;
  slice: BehaviourSliceFixturePayload;
}

interface WritebackRequestBody {
  apply?: boolean;
  draft?: {
    id?: string;
    behavior_id?: string;
    proposed_slices?: Array<{
      file_path?: string;
      start_line?: number;
      end_line?: number;
      new_text?: string;
      intent_role?: string;
    }>;
    origin?: {
      actor?: string;
      intent?: string;
      timestamp_ms?: number;
      request_id?: string | null;
    };
    parent_revision?: string;
    created_at_ms?: number;
  };
}

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
  if (options.parentRevision !== undefined) {
    url.searchParams.set('parentRevision', options.parentRevision);
  }
  if (options.mode) {
    url.searchParams.set('mode', options.mode);
  }
  if (options.sliceCount !== undefined) {
    url.searchParams.set('sliceCount', String(options.sliceCount));
  }
  if (options.sliceTexts !== undefined) {
    options.sliceTexts.forEach((sliceText, index) => {
      url.searchParams.set(`sliceText${index}`, sliceText);
    });
  }
  if (options.trustState) {
    url.searchParams.set('trustState', options.trustState);
  }
  if (options.withGetSliceText !== undefined) {
    url.searchParams.set('withGetSliceText', options.withGetSliceText ? '1' : '0');
  }
  if (options.withDescription !== undefined) {
    url.searchParams.set('withDescription', options.withDescription ? '1' : '0');
  }
  if (options.withPromoteCallback !== undefined) {
    url.searchParams.set('withPromoteCallback', options.withPromoteCallback ? 'true' : 'false');
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

function sliceEditor(page: Page, index: number): Locator {
  return page.getByTestId(`behaviour-card-slice-editor-${index}`);
}

function saveButton(page: Page): Locator {
  return page.getByTestId('behaviour-card-save-button');
}

function cancelButton(page: Page): Locator {
  return page.getByTestId('behaviour-card-cancel-button');
}

function statusBanner(page: Page): Locator {
  return page.getByTestId('behaviour-card-status-banner');
}

function reloadButton(page: Page): Locator {
  return page.getByTestId('behaviour-card-reload-button');
}

function promoteToTestButton(page: Page): Locator {
  return page.getByTestId('behaviour-card-promote-to-test');
}

async function events(page: Page): Promise<BehaviourCardFixtureEvent[]> {
  return page.evaluate(() => window.__behaviourCardEvents.slice());
}

async function resetEvents(page: Page) {
  await page.evaluate(() => window.__resetBehaviourCardEvents());
}

async function getSliceTextCalls(page: Page): Promise<BehaviourCardGetSliceTextCall[]> {
  return page.evaluate(() => window.__behaviourCardGetSliceTextCalls.slice());
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

function writebackSuccessResponse(requestBody: WritebackRequestBody) {
  const draft = requestBody.draft ?? {};
  return {
    ok: true,
    plan: {
      draft,
      effective_diff: '--- src/checkout/request.ts\n+++ src/checkout/request.ts\n',
      applies_against_revision: draft.parent_revision ?? 'rev:test-parent',
      validated_at_ms: Date.now(),
    },
    applied_revision: 'rev:test-applied',
    files_written: (draft.proposed_slices ?? []).map((slice) => slice.file_path),
    request_id: 'request:test-success',
  };
}

function writebackConflictResponse(requestBody: WritebackRequestBody) {
  const draft = requestBody.draft ?? {};
  return {
    ok: false,
    conflict: {
      draft_id: draft.id ?? 'draft:missing',
      conflicting_files: [
        {
          file_path: draft.proposed_slices?.[0]?.file_path ?? 'src/checkout/request.ts',
          conflict_kind: 'lines-changed',
          source_unchanged: false,
        },
      ],
      observed_revision: 'rev:test-observed',
      expected_revision: draft.parent_revision ?? 'rev:test-parent',
    },
    request_id: 'request:test-conflict',
  };
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

  test('shows promote to test when trust is candidate and callback is supplied', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, {
      trustState: 'candidate',
      withPromoteCallback: true,
    });

    await expect(promoteToTestButton(page)).toBeVisible();
    await expect(promoteToTestButton(page)).toHaveAttribute(
      'aria-label',
      'Promote Checkout behavior to test',
    );
  });

  test('hides promote to test when trust is grounded or stale', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, {
      trustState: 'candidate',
      withPromoteCallback: true,
    });
    await expect(promoteToTestButton(page)).toBeVisible();

    for (const trustState of ['grounded', 'stale'] as const) {
      await openFixture(page, baseURL, {
        trustState,
        withPromoteCallback: true,
      });

      await expect(promoteToTestButton(page)).toHaveCount(0);
    }
  });

  test('clicking promote to test fires onPromoteToTest with the behaviour record', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, {
      trustState: 'candidate',
      withPromoteCallback: true,
    });
    await resetEvents(page);

    await expect(promoteToTestButton(page)).toBeVisible();
    await promoteToTestButton(page).click();

    await expect.poll(() => events(page)).toEqual([
      {
        type: 'promote',
        behaviour: expect.objectContaining({
          id: 'behavior:checkout.lifecycle',
          label: 'Checkout behavior',
          trust: expect.objectContaining({
            state: 'candidate',
          }),
        }),
      },
    ]);
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

  test('edit mode renders textareas per slice when getSliceText is supplied', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, {
      mode: 'edit',
      sliceCount: 2,
      sliceTexts: ['validateRequest(input);\n', 'authorizePayment(payment);\n'],
      withGetSliceText: true,
    });

    await expect(sliceEditor(page, 0)).toHaveValue('validateRequest(input);\n');
    await expect(sliceEditor(page, 0)).toHaveAttribute(
      'aria-label',
      'Edit src/checkout/request.ts lines 12-28',
    );
    await expect(sliceEditor(page, 1)).toHaveValue('authorizePayment(payment);\n');
    await expect(sliceEditor(page, 2)).toHaveCount(0);
  });

  test('edit mode shows a banner when getSliceText is missing', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, {
      mode: 'edit',
      sliceCount: 2,
      withGetSliceText: false,
    });

    await expect(statusBanner(page)).toContainText('Slice content unavailable');
    await expect(sliceEditor(page, 0)).toHaveCount(0);
  });

  test('save click POSTs /api/writeback with the right draft shape', async ({
    page,
    baseURL,
  }) => {
    let requestBody: WritebackRequestBody | null = null;
    await page.route('**/api/writeback', async (route) => {
      const body = (await route.request().postDataJSON()) as WritebackRequestBody;
      requestBody = body;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(writebackSuccessResponse(body)),
      });
    });

    const { editRadio } = await openFixture(page, baseURL, {
      mode: 'edit',
      parentRevision: 'rev:test-parent',
      sliceCount: 1,
      sliceTexts: ['validateRequest(input);\n'],
      withGetSliceText: true,
    });

    await expectChecked(editRadio, true);
    await sliceEditor(page, 0).fill('validateRequest(editedInput);\n');
    await saveButton(page).click();

    await expect.poll(() => requestBody).toMatchObject({
      apply: true,
      draft: {
        behavior_id: 'behavior:checkout.lifecycle',
        parent_revision: 'rev:test-parent',
        proposed_slices: [
          {
            file_path: 'src/checkout/request.ts',
            start_line: 12,
            end_line: 28,
            new_text: 'validateRequest(editedInput);\n',
            intent_role: 'entry-point',
          },
        ],
        origin: {
          actor: 'you-this-session',
          intent: 'user-edit',
          request_id: null,
        },
      },
    });

    expect(requestBody?.draft?.id).toMatch(/^draft:behavior:checkout\.lifecycle:\d+$/);
    expect(requestBody?.draft?.origin?.timestamp_ms).toEqual(expect.any(Number));
    expect(requestBody?.draft?.created_at_ms).toEqual(expect.any(Number));
  });

  test('pending state disables edit actions and marks Save busy', async ({ page, baseURL }) => {
    let releaseWriteback: (() => void) | null = null;
    await page.route('**/api/writeback', async (route) => {
      const requestBody = (await route.request().postDataJSON()) as WritebackRequestBody;
      await new Promise<void>((resolve) => {
        releaseWriteback = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(writebackSuccessResponse(requestBody)),
      });
    });

    await openFixture(page, baseURL, {
      mode: 'edit',
      parentRevision: 'rev:test-parent',
      sliceCount: 1,
      sliceTexts: ['validateRequest(input);\n'],
      withGetSliceText: true,
    });

    await sliceEditor(page, 0).fill('validateRequest(editedInput);\n');
    await saveButton(page).click();

    await expect(saveButton(page)).toBeDisabled();
    await expect(cancelButton(page)).toBeDisabled();
    await expect(saveButton(page)).toHaveAttribute('aria-busy', 'true');
    await expect(statusBanner(page)).toContainText('Saving');

    releaseWriteback?.();
  });

  test('success transitions to view mode and fires onSaved', async ({ page, baseURL }) => {
    await page.route('**/api/writeback', async (route) => {
      const requestBody = (await route.request().postDataJSON()) as WritebackRequestBody;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(writebackSuccessResponse(requestBody)),
      });
    });

    const { viewRadio } = await openFixture(page, baseURL, {
      mode: 'edit',
      parentRevision: 'rev:test-parent',
      sliceCount: 1,
      sliceTexts: ['validateRequest(input);\n'],
      withGetSliceText: true,
    });
    await resetEvents(page);

    await sliceEditor(page, 0).fill('validateRequest(editedInput);\n');
    await saveButton(page).click();

    await expectChecked(viewRadio, true);
    await expect(sliceEditor(page, 0)).toHaveCount(0);
    await expect.poll(() => events(page)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'saved',
        }),
      ]),
    );
  });

  test('conflict stays in edit mode, fires onConflict, and shows reload banner', async ({
    page,
    baseURL,
  }) => {
    await page.route('**/api/writeback', async (route) => {
      const requestBody = (await route.request().postDataJSON()) as WritebackRequestBody;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(writebackConflictResponse(requestBody)),
      });
    });

    const { editRadio } = await openFixture(page, baseURL, {
      mode: 'edit',
      parentRevision: 'rev:test-parent',
      sliceCount: 1,
      sliceTexts: ['validateRequest(input);\n'],
      withGetSliceText: true,
    });
    await resetEvents(page);

    await sliceEditor(page, 0).fill('validateRequest(editedInput);\n');
    await saveButton(page).click();

    await expectChecked(editRadio, true);
    await expect(sliceEditor(page, 0)).toBeVisible();
    await expect(statusBanner(page)).toContainText('Source has changed since you started editing');
    await expect(reloadButton(page)).toBeVisible();
    await expect.poll(() => events(page)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'conflict',
        }),
      ]),
    );
  });

  test('reload after conflict re-fetches slice text and replaces the textarea contents', async ({
    page,
    baseURL,
  }) => {
    await page.route('**/api/writeback', async (route) => {
      const requestBody = (await route.request().postDataJSON()) as WritebackRequestBody;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(writebackConflictResponse(requestBody)),
      });
    });

    await openFixture(page, baseURL, {
      mode: 'edit',
      parentRevision: 'rev:test-parent',
      sliceCount: 1,
      sliceTexts: ['validateRequest(input);\n'],
      withGetSliceText: true,
    });

    await sliceEditor(page, 0).fill('validateRequest(editedInput);\n');
    await saveButton(page).click();
    await expect(reloadButton(page)).toBeVisible();

    await page.evaluate(() => {
      window.__behaviourCardSliceTextByIndex[0] = 'validateRequest(freshInput);\n';
    });
    await reloadButton(page).click();

    await expect(sliceEditor(page, 0)).toHaveValue('validateRequest(freshInput);\n');
    await expect
      .poll(async () => (await getSliceTextCalls(page)).filter((call) => call.index === 0).length)
      .toBeGreaterThanOrEqual(2);
  });
});
