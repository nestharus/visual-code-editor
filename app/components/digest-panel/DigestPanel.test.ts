import { expect, test, type ConsoleMessage, type Locator, type Page, type Response } from '@playwright/test';

import type { ChangeEvent, ChangeEventTier } from '../../lib/user-context';

declare global {
  interface Window {
    __digestPanelClickEvents: string[];
    __digestPanelDisposeEvents: DigestPanelDisposeEvent[];
    __resetDigestPanelEvents: () => void;
  }
}

const FIXTURE_PATH = '/e2e/fixtures/digest-panel.html';

interface DigestPanelDisposeEvent {
  eventId: string;
  disposition: 'disposed_to_immediate' | 'dismissed';
}

interface FixtureLoad {
  loadErrors: string[];
  root: Locator;
}

interface FixtureHandles extends FixtureLoad {
  immediateSection: Locator;
  stashedSection: Locator;
  suppressedSection: Locator;
}

function fixtureUrl(baseURL: string | undefined): string {
  return new URL(FIXTURE_PATH, baseURL ?? 'http://localhost:8742').toString();
}

async function gotoFixture(
  page: Page,
  baseURL: string | undefined,
): Promise<FixtureLoad> {
  const loadErrors: string[] = [];
  const responseErrorReads: Promise<void>[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      loadErrors.push(message.text());
    }
  };
  const onPageError = (error: Error) => {
    loadErrors.push(error.message);
  };
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

  await page.goto(fixtureUrl(baseURL));
  await Promise.all(responseErrorReads);

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('response', onResponse);

  return {
    loadErrors,
    root: page.getByTestId('digest-panel'),
  };
}

async function openFixture(page: Page, baseURL: string | undefined): Promise<FixtureHandles> {
  const load = await gotoFixture(page, baseURL);

  try {
    await expect(load.root).toBeVisible();
  } catch (error) {
    throw new Error(
      [
        'DigestPanel fixture did not mount.',
        'This is expected until /app/components/digest-panel/DigestPanel.tsx exists and exports DigestPanel.',
        load.loadErrors.length > 0
          ? `Browser errors: ${load.loadErrors.join(' | ')}`
          : 'Browser errors: none captured.',
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    );
  }

  return {
    ...load,
    immediateSection: page.getByTestId('digest-section-immediate'),
    stashedSection: page.getByTestId('digest-section-stashed'),
    suppressedSection: page.getByTestId('digest-section-suppressed'),
  };
}

function eventRow(page: Page, tier: ChangeEventTier, index: number): Locator {
  return page.getByTestId(`digest-event-row-${tier}-${index}`);
}

async function resetEvents(page: Page) {
  await page.evaluate(() => window.__resetDigestPanelEvents());
}

async function clickEvents(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__digestPanelClickEvents.slice());
}

async function disposeEvents(page: Page): Promise<DigestPanelDisposeEvent[]> {
  return page.evaluate(() => window.__digestPanelDisposeEvents.slice());
}

test.describe('DigestPanel', () => {
  test('renders Immediate, Stashed, and Suppressed sections', async ({ page, baseURL }) => {
    const { immediateSection, stashedSection, suppressedSection } = await openFixture(page, baseURL);

    await expect(immediateSection).toBeVisible();
    await expect(immediateSection).toContainText('Immediate');
    await expect(stashedSection).toBeVisible();
    await expect(stashedSection).toContainText('Stashed');
    await expect(suppressedSection).toBeVisible();
    await expect(suppressedSection).toContainText('Suppressed');
  });

  test('keeps suppressed events collapsed by default', async ({ page, baseURL }) => {
    await openFixture(page, baseURL);

    await expect(page.getByTestId('digest-show-suppressed')).toBeVisible();
    await expect(eventRow(page, 'suppressed', 0)).toBeHidden();
  });

  test('per-event row shows kind, actor, and summary', async ({ page, baseURL }) => {
    await openFixture(page, baseURL);
    const row = eventRow(page, 'immediate', 0);

    await expect(row).toContainText('entity-renamed');
    await expect(row).toContainText('you-other-session');
    await expect(row).toContainText('Immediate fixture summary');
  });

  test('clicking an event row fires onEventClick', async ({ page, baseURL }) => {
    await openFixture(page, baseURL);
    await resetEvents(page);

    await eventRow(page, 'immediate', 0).click({ position: { x: 24, y: 24 } });

    await expect.poll(() => clickEvents(page)).toEqual(['change:fixture-immediate']);
    expect(await disposeEvents(page)).toEqual([]);
  });

  test('Surface moves a stashed event to immediate and records disposition', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL);
    await resetEvents(page);

    await eventRow(page, 'stashed', 0).getByTestId('digest-action-surface-0').click();

    await expect.poll(() => disposeEvents(page)).toEqual([
      {
        eventId: 'change:fixture-stashed',
        disposition: 'disposed_to_immediate',
      },
    ]);
    await expect(eventRow(page, 'stashed', 0)).toBeHidden();
    await expect(eventRow(page, 'immediate', 1)).toContainText('Stashed fixture summary');
    expect(await clickEvents(page)).toEqual([]);
  });
});
