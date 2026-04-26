import { expect, test, type ConsoleMessage, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    __zoomContextFactorReads: number;
    __zoomContextBandReads: string[];
    setFactor: (factor: number) => void;
  }
}

const FIXTURE_PATH = '/e2e/fixtures/zoom-context.html';

interface FixtureOptions {
  factor?: number;
  noprovider?: boolean;
}

interface FixtureLoad {
  loadErrors: string[];
  readout: Locator;
}

function fixtureUrl(baseURL: string | undefined, options: FixtureOptions = {}): string {
  const url = new URL(FIXTURE_PATH, baseURL ?? 'http://localhost:8742');

  if (options.factor !== undefined) {
    url.searchParams.set('factor', String(options.factor));
  }
  if (options.noprovider === true) {
    url.searchParams.set('noprovider', 'true');
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
    readout: page.getByTestId('zoom-band-readout'),
  };
}

async function openFixture(
  page: Page,
  baseURL: string | undefined,
  options: FixtureOptions = {},
): Promise<FixtureLoad> {
  const load = await gotoFixture(page, baseURL, options);

  try {
    await expect(load.readout).toBeVisible();
  } catch (error) {
    throw new Error(
      [
        'ZoomBandProvider fixture did not mount.',
        'This is expected until /app/lib/zoom-context.tsx exists and exports ZoomBandProvider and useZoomBand.',
        load.loadErrors.length > 0
          ? `Browser errors: ${load.loadErrors.join(' | ')}`
          : 'Browser errors: none captured.',
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    );
  }

  return load;
}

async function providerRoot(page: Page): Promise<Locator> {
  const root = page.locator('[data-zoom-band]').first();
  await expect(root).toBeVisible();
  return root;
}

test.describe('ZoomBandProvider', () => {
  test('renders the current band for the initial factor', async ({ page, baseURL }) => {
    const { readout } = await openFixture(page, baseURL, { factor: 0.6 });

    await expect(readout).toHaveText('structure');
  });

  test('reacts when the fixture factor changes', async ({ page, baseURL }) => {
    const { readout } = await openFixture(page, baseURL, { factor: 0.6 });

    await page.evaluate(() => window.setFactor(1.0));

    await expect(readout).toHaveText('detail');
  });

  test('clamps boundary factors to the nearest band', async ({ page, baseURL }) => {
    let load = await openFixture(page, baseURL, { factor: -1 });

    await expect(load.readout).toHaveText('overview');

    load = await openFixture(page, baseURL, { factor: 99 });

    await expect(load.readout).toHaveText('source');
  });

  test('sets data-zoom-band on the provider root', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { factor: 0.6 });

    await expect(await providerRoot(page)).toHaveAttribute('data-zoom-band', 'structure');
  });

  test('renders the outside-provider error path', async ({ page, baseURL }) => {
    await gotoFixture(page, baseURL, { noprovider: true });

    await expect(page.getByTestId('zoom-error')).toHaveText(
      'useZoomBand must be used inside a ZoomBandProvider',
    );
  });

  test('memoizes the derived band across repeated accessor reads', async ({ page, baseURL }) => {
    const { readout } = await openFixture(page, baseURL, { factor: 0.6 });

    await expect(readout).toHaveText('structure');
    await expect
      .poll(() => page.evaluate(() => window.__zoomContextBandReads))
      .toEqual(['structure', 'structure', 'structure']);
    await expect.poll(() => page.evaluate(() => window.__zoomContextFactorReads)).toBe(1);
  });
});
