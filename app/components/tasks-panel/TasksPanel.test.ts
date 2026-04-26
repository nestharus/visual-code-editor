import { expect, test, type ConsoleMessage, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    __tasksPanelOpenEvents: string[];
    __tasksPanelTransitionEvents: TaskTransitionEvent[];
    __resetTasksPanelEvents: () => void;
  }
}

const FIXTURE_PATH = '/e2e/fixtures/tasks-panel.html';

type TaskState =
  | 'pending'
  | 'running'
  | 'paused'
  | 'ready-for-pr'
  | 'in-pr'
  | 'merged'
  | 'abandoned'
  | 'failed';

interface TaskTransitionEvent {
  taskId: string;
  toState: TaskState;
  reason: string;
}

interface FixtureOptions {
  count?: number;
  emptyMessage?: string;
  statePattern?: readonly TaskState[];
}

interface FixtureLoad {
  loadErrors: string[];
  root: Locator;
}

interface FixtureHandles extends FixtureLoad {
  header: Locator;
}

const ALL_TASK_STATES = [
  'pending',
  'running',
  'paused',
  'ready-for-pr',
  'in-pr',
  'merged',
  'abandoned',
  'failed',
] as const satisfies readonly TaskState[];

function fixtureUrl(baseURL: string | undefined, options: FixtureOptions = {}): string {
  const url = new URL(FIXTURE_PATH, baseURL ?? 'http://localhost:8742');

  if (options.count !== undefined) {
    url.searchParams.set('count', String(options.count));
  }
  if (options.emptyMessage !== undefined) {
    url.searchParams.set('emptyMessage', options.emptyMessage);
  }
  if (options.statePattern !== undefined) {
    url.searchParams.set('statePattern', options.statePattern.join(','));
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
    root: page.getByTestId('tasks-panel'),
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
        'TasksPanel fixture did not mount.',
        'This is expected until /app/components/tasks-panel/TasksPanel.tsx exists and exports TasksPanel.',
        load.loadErrors.length > 0
          ? `Browser errors: ${load.loadErrors.join(' | ')}`
          : 'Browser errors: none captured.',
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    );
  }

  return {
    ...load,
    header: page.getByTestId('tasks-panel-header'),
  };
}

function taskRow(page: Page, index: number): Locator {
  return page.getByTestId(`task-row-${index}`);
}

function stateBadge(page: Page, index: number): Locator {
  return page.getByTestId(`task-state-badge-${index}`);
}

function taskAction(row: Locator, action: string): Locator {
  return row.getByTestId(`task-action-${action}`);
}

async function resetEvents(page: Page) {
  await page.evaluate(() => window.__resetTasksPanelEvents());
}

async function transitionEvents(page: Page): Promise<TaskTransitionEvent[]> {
  return page.evaluate(() => window.__tasksPanelTransitionEvents.slice());
}

async function openEvents(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__tasksPanelOpenEvents.slice());
}

test.describe('TasksPanel', () => {
  test('renders all tasks', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, {
      count: 3,
      statePattern: ['pending', 'running', 'merged'],
    });

    await expect(page.getByRole('listitem')).toHaveCount(3);
    await expect(taskRow(page, 0)).toBeVisible();
    await expect(taskRow(page, 1)).toBeVisible();
    await expect(taskRow(page, 2)).toBeVisible();
  });

  test('renders the default empty state', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { count: 0 });

    await expect(page.getByTestId('tasks-panel-empty')).toHaveText('No tasks dispatched yet.');
  });

  test('renders a custom empty state', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { count: 0, emptyMessage: 'Hello' });

    await expect(page.getByTestId('tasks-panel-empty')).toHaveText('Hello');
  });

  test('renders a state badge per state with the state label and class', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, {
      count: ALL_TASK_STATES.length,
      statePattern: ALL_TASK_STATES,
    });

    for (const [index, state] of ALL_TASK_STATES.entries()) {
      await expect(stateBadge(page, index)).toHaveText(state);
      await expect(stateBadge(page, index)).toHaveAttribute('aria-label', `State: ${state}`);
      await expect(stateBadge(page, index)).toHaveClass(new RegExp(`\\btask-state--${state}\\b`));
    }
  });

  test('counts only non-terminal tasks in the header active count', async ({
    page,
    baseURL,
  }) => {
    const { header } = await openFixture(page, baseURL, {
      count: 8,
      statePattern: ALL_TASK_STATES,
    });

    await expect(header).toHaveText('Tasks (5 active)');
  });

  test('renders pending cancel and transitions to abandoned without opening the task', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, { count: 1, statePattern: ['pending'] });
    await resetEvents(page);

    await taskAction(taskRow(page, 0), 'cancel').click();

    await expect.poll(() => transitionEvents(page)).toEqual([
      {
        taskId: 'task:fixture-0',
        toState: 'abandoned',
        reason: expect.any(String),
      },
    ]);
    expect((await transitionEvents(page))[0].reason.length).toBeGreaterThan(0);
    expect(await openEvents(page)).toEqual([]);
  });

  test('renders running pause and transitions to paused without opening the task', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, { count: 1, statePattern: ['running'] });
    await resetEvents(page);

    await taskAction(taskRow(page, 0), 'pause').click();

    await expect.poll(() => transitionEvents(page)).toEqual([
      {
        taskId: 'task:fixture-0',
        toState: 'paused',
        reason: expect.any(String),
      },
    ]);
    expect((await transitionEvents(page))[0].reason.length).toBeGreaterThan(0);
    expect(await openEvents(page)).toEqual([]);
  });

  test('renders ready-for-pr promote and cancel, and promote transitions to in-pr', async ({
    page,
    baseURL,
  }) => {
    await openFixture(page, baseURL, { count: 1, statePattern: ['ready-for-pr'] });
    const row = taskRow(page, 0);
    await resetEvents(page);

    await expect(taskAction(row, 'promote-to-pr')).toBeVisible();
    await expect(taskAction(row, 'cancel')).toBeVisible();

    await taskAction(row, 'promote-to-pr').click();

    await expect.poll(() => transitionEvents(page)).toEqual([
      {
        taskId: 'task:fixture-0',
        toState: 'in-pr',
        reason: expect.any(String),
      },
    ]);
    expect((await transitionEvents(page))[0].reason.length).toBeGreaterThan(0);
    expect(await openEvents(page)).toEqual([]);
  });

  test('renders no task actions for merged tasks', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { count: 1, statePattern: ['merged'] });

    await expect(taskRow(page, 0).locator('[data-testid^="task-action-"]')).toHaveCount(0);
  });

  test('clicking a row opens the task without transitioning it', async ({ page, baseURL }) => {
    await openFixture(page, baseURL, { count: 1, statePattern: ['running'] });
    await resetEvents(page);

    await taskRow(page, 0).click({ position: { x: 24, y: 24 } });

    await expect.poll(() => openEvents(page)).toEqual(['task:fixture-0']);
    expect(await transitionEvents(page)).toEqual([]);
  });
});
