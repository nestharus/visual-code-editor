import { expect, test, type ConsoleMessage, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    __widgetInventoryClickEvents: string[];
    __resetWidgetInventoryEvents: () => void;
  }
}

const FIXTURE_PATH = '/e2e/fixtures/widget-inventory.html';

interface FixtureOptions {
  count?: number;
}

interface FixtureLoad {
  loadErrors: string[];
  root: Locator;
}

function fixtureUrl(baseURL: string | undefined, options: FixtureOptions = {}): string {
  const url = new URL(FIXTURE_PATH, baseURL ?? 'http://localhost:8742');

  if (options.count !== undefined) {
    url.searchParams.set('count', String(options.count));
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
    root: page.getByTestId('widget-inventory-panel'),
  };
}

async function openFixture(
  page: Page,
  baseURL: string | undefined,
  options: FixtureOptions = {},
): Promise<FixtureLoad> {
  const load = await gotoFixture(page, baseURL, options);

  try {
    await expect(load.root).toBeVisible();
  } catch (error) {
    throw new Error(
      [
        'WidgetInventoryPanel fixture did not mount.',
        'This is expected until /app/components/widget-inventory/WidgetInventoryPanel.tsx exists and exports WidgetInventoryPanel.',
        load.loadErrors.length > 0
          ? `Browser errors: ${load.loadErrors.join(' | ')}`
          : 'Browser errors: none captured.',
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    );
  }

  return load;
}

function widgetRow(page: Page, index: number): Locator {
  return page.getByTestId(`widget-row-${index}`);
}

function kindChip(page: Page, index: number): Locator {
  return page.getByTestId(`widget-kind-chip-${index}`);
}

async function resetEvents(page: Page) {
  await page.evaluate(() => window.__resetWidgetInventoryEvents());
}

async function clickEvents(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__widgetInventoryClickEvents.slice());
}

test.describe('WidgetInventoryPanel', () => {
  test('renders all supplied widgets', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { count: 3 });

    await expect(page.getByRole('listitem')).toHaveCount(3);
    await expect(widgetRow(page, 0)).toBeVisible();
    await expect(widgetRow(page, 1)).toBeVisible();
    await expect(widgetRow(page, 2)).toBeVisible();
  });

  test('renders kind chip, label, and source path for each row', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { count: 1 });

    await expect(kindChip(page, 0)).toHaveText('button');
    await expect(widgetRow(page, 0)).toContainText('Login Button');
    await expect(widgetRow(page, 0)).toContainText('app/components/auth/LoginButton.tsx');
  });

  test('renders the render snapshot count hint per widget row', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { count: 2 });

    await expect(widgetRow(page, 0)).toContainText('Renders (2)');
    await expect(widgetRow(page, 1)).toContainText('Renders (0)');
  });

  test('renders the empty placeholder', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { count: 0 });

    await expect(page.getByTestId('widget-inventory-empty')).toHaveText(
      'No widgets discovered',
    );
  });

  test('clicking a row fires onWidgetClick with that widget', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { count: 2 });
    await resetEvents(page);

    await widgetRow(page, 1).click();

    await expect.poll(() => clickEvents(page)).toEqual(['widget:fixture.email-field']);
  });
});
