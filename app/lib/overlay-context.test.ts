import { expect, test, type ConsoleMessage, type Locator, type Page } from '@playwright/test';

import type {
  OperationalOverlay,
  OverlayLayer,
  OverlayProviderId,
  OverlaySignal,
  OverlaySignalKind,
} from './overlay';

declare global {
  interface Window {
    __overlayContextProbeRuns: { primary: number; secondary: number };
    setOverlay: (overlay: OperationalOverlay) => void;
  }
}

const FIXTURE_PATH = '/e2e/fixtures/overlay-context.html';

const PROVIDER_IDS = [
  'g:test',
  'g:pr-delta',
  'g:deploy',
  'g:profile',
  'g:task-active',
] as const satisfies readonly OverlayProviderId[];

interface FixtureOptions {
  overlay?: OperationalOverlay;
  entityId?: string;
  secondaryEntityId?: string;
  noprovider?: boolean;
}

interface FixtureLoad {
  loadErrors: string[];
  readout: Locator;
  secondaryReadout: Locator;
}

function signal(
  entityId: string,
  providerId: OverlayProviderId,
  kind: OverlaySignalKind,
): OverlaySignal {
  return {
    providerId,
    entityId,
    kind,
    label: `${providerId} ${kind}`,
    trust: { state: 'grounded', grounding: 'runtime-trace' },
    emittedAtMs: 1_700_000_000_000,
    detailUrl: null,
  };
}

function layer(providerId: OverlayProviderId, signals: readonly OverlaySignal[]): OverlayLayer {
  return {
    providerId,
    signals,
    computedAtMs: 1_700_000_000_500,
    attributionActor: 'ci',
  };
}

function overlay(layers: readonly OverlayLayer[] = []): OperationalOverlay {
  return {
    layers,
    computedAtMs: 1_700_000_001_000,
  };
}

function singleSignalOverlay(
  entityId: string,
  providerId: OverlayProviderId,
  kind: OverlaySignalKind,
): OperationalOverlay {
  return overlay([layer(providerId, [signal(entityId, providerId, kind)])]);
}

function expectedReadout(
  overrides: Partial<Record<OverlayProviderId, OverlaySignalKind | null>> = {},
): string {
  return JSON.stringify(
    Object.fromEntries(PROVIDER_IDS.map((providerId) => [providerId, overrides[providerId] ?? null])),
  );
}

function fixtureUrl(baseURL: string | undefined, options: FixtureOptions = {}): string {
  const url = new URL(FIXTURE_PATH, baseURL ?? 'http://localhost:8742');

  if (options.overlay !== undefined) {
    url.searchParams.set('overlay', JSON.stringify(options.overlay));
  }
  if (options.entityId !== undefined) {
    url.searchParams.set('entityId', options.entityId);
  }
  if (options.secondaryEntityId !== undefined) {
    url.searchParams.set('secondaryEntityId', options.secondaryEntityId);
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
    readout: page.getByTestId('signals-readout'),
    secondaryReadout: page.getByTestId('secondary-signals-readout'),
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
        'OverlayProvider fixture did not mount.',
        'This is expected until /app/lib/overlay-context.tsx exists and exports OverlayProvider and useOverlaySignals.',
        load.loadErrors.length > 0
          ? `Browser errors: ${load.loadErrors.join(' | ')}`
          : 'Browser errors: none captured.',
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    );
  }

  return load;
}

test.describe('OverlayProvider', () => {
  test('returns all-null provider entries for an empty overlay', async ({ page, baseURL }) => {
    const { readout } = await openFixture(page, baseURL, {
      overlay: overlay(),
      entityId: 'system:api',
    });

    await expect(readout).toHaveText(expectedReadout());
  });

  test('looks up a signal by entity id and provider id', async ({ page, baseURL }) => {
    const { readout } = await openFixture(page, baseURL, {
      overlay: singleSignalOverlay('system:api', 'g:test', 'fail'),
      entityId: 'system:api',
    });

    await expect(readout).toHaveText(expectedReadout({ 'g:test': 'fail' }));
  });

  test('reacts when the fixture overlay changes', async ({ page, baseURL }) => {
    const { readout } = await openFixture(page, baseURL, {
      overlay: singleSignalOverlay('system:api', 'g:test', 'fail'),
      entityId: 'system:api',
    });

    await page.evaluate((nextOverlay) => window.setOverlay(nextOverlay), {
      ...singleSignalOverlay('system:api', 'g:test', 'pass'),
    });

    await expect(readout).toHaveText(expectedReadout({ 'g:test': 'pass' }));
  });

  test('throws the documented error outside a provider', async ({ page, baseURL }) => {
    await gotoFixture(page, baseURL, { noprovider: true });

    await expect(page.getByTestId('overlay-error')).toHaveText(
      'useOverlaySignals must be used inside an OverlayProvider',
    );
  });

  test('reports signals from multiple providers for one entity', async ({ page, baseURL }) => {
    const { readout } = await openFixture(page, baseURL, {
      overlay: overlay([
        layer('g:test', [signal('system:api', 'g:test', 'fail')]),
        layer('g:deploy', [signal('system:api', 'g:deploy', 'pass')]),
      ]),
      entityId: 'system:api',
    });

    await expect(readout).toHaveText(expectedReadout({ 'g:test': 'fail', 'g:deploy': 'pass' }));
  });

  test("does not invalidate a different entity's accessor when one entity changes", async ({
    page,
    baseURL,
  }) => {
    const initialOverlay = overlay([
      layer('g:test', [
        signal('system:api', 'g:test', 'fail'),
        signal('system:web', 'g:test', 'pass'),
      ]),
    ]);
    const updatedOverlay = overlay([
      layer('g:test', [
        signal('system:api', 'g:test', 'pass'),
        signal('system:web', 'g:test', 'pass'),
      ]),
    ]);
    const { readout, secondaryReadout } = await openFixture(page, baseURL, {
      overlay: initialOverlay,
      entityId: 'system:api',
      secondaryEntityId: 'system:web',
    });

    await expect(readout).toHaveText(expectedReadout({ 'g:test': 'fail' }));
    await expect(secondaryReadout).toHaveText(expectedReadout({ 'g:test': 'pass' }));
    await expect.poll(() => page.evaluate(() => window.__overlayContextProbeRuns)).toEqual({
      primary: 1,
      secondary: 1,
    });

    await page.evaluate((nextOverlay) => window.setOverlay(nextOverlay), updatedOverlay);

    await expect(readout).toHaveText(expectedReadout({ 'g:test': 'pass' }));
    await expect(secondaryReadout).toHaveText(expectedReadout({ 'g:test': 'pass' }));
    await expect.poll(() => page.evaluate(() => window.__overlayContextProbeRuns)).toEqual({
      primary: 2,
      secondary: 1,
    });
  });
});
