import { expect, test, type Page } from "@playwright/test";

import type { Task, TaskState } from "../app/lib/task";
import { setupMockApi } from "./helpers";

type DispatchBody = Record<string, unknown>;
type TransitionBody = {
  taskId: string;
  body: Record<string, unknown>;
};

const TERMINAL_STATES: ReadonlySet<TaskState> = new Set([
  "merged",
  "abandoned",
  "failed",
]);

function tasksButton(page: Page) {
  return page.getByTestId("tasks-toolbar-button");
}

function tasksOverlay(page: Page) {
  return page.getByTestId("tasks-panel-overlay");
}

function promptInput(page: Page) {
  return page.getByTestId("prompt-input");
}

function submitButton(page: Page) {
  return page.getByTestId("submit-button");
}

function taskFixture(overrides: Partial<Task> = {}): Task {
  const now = Date.now();
  const id = overrides.id ?? "task:integration-fixture";
  const label = overrides.label ?? "Integration fixture task";
  const state = overrides.state ?? "pending";

  return {
    id,
    label,
    description: overrides.description ?? null,
    state,
    worktree: overrides.worktree ?? {
      path: `/tmp/${id.replace(/[^a-zA-Z0-9._-]/g, "-")}`,
      branch: `task/${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      baseBranch: "main",
      baseRevision: "base-revision",
      headRevision: null,
      createdAtMs: now,
    },
    originActor: overrides.originActor ?? "you-this-session",
    agentActor: overrides.agentActor ?? "agents:direct",
    relatedBehaviorIds: overrides.relatedBehaviorIds ?? [],
    prompt: overrides.prompt ?? label,
    requestId: overrides.requestId ?? `request:${id}`,
    stateHistory: overrides.stateHistory ?? [
      {
        fromState: null,
        toState: state,
        actor: "you-this-session",
        reason: "task dispatched",
        timestampMs: now,
      },
    ],
    prUrl: overrides.prUrl ?? null,
    createdAtMs: overrides.createdAtMs ?? now,
  };
}

async function setupTasksApi(page: Page, initialTasks: readonly Task[] = []) {
  const tasks = [...initialTasks];
  const dispatchBodies: DispatchBody[] = [];
  const transitionBodies: TransitionBody[] = [];
  let getTasksCount = 0;

  await setupMockApi(page);

  await page.route(/\/api\/tasks(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    getTasksCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ tasks }),
    });
  });

  await page.route(/\/api\/tasks\/dispatch(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const body = JSON.parse(route.request().postData() || "{}") as DispatchBody;
    dispatchBodies.push(body);

    const task = taskFixture({
      id: `task:dispatched-${dispatchBodies.length}`,
      label: String(body.label ?? "Dispatched task"),
      prompt: String(body.prompt ?? ""),
      requestId: String(body.request_id ?? `request:dispatched-${dispatchBodies.length}`),
      relatedBehaviorIds: Array.isArray(body.related_behavior_ids)
        ? body.related_behavior_ids.filter(
            (behaviorId): behaviorId is string => typeof behaviorId === "string",
          )
        : [],
    });
    tasks.unshift(task);

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        task,
        request_id: task.requestId,
      }),
    });
  });

  await page.route(/\/api\/tasks\/[^/]+\/transition(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const taskId = decodeURIComponent(url.pathname.split("/")[3] ?? "");
    const body = JSON.parse(route.request().postData() || "{}") as Record<
      string,
      unknown
    >;
    transitionBodies.push({ taskId, body });

    const taskIndex = tasks.findIndex((task) => task.id === taskId);
    const nextState =
      typeof body.to_state === "string" ? (body.to_state as TaskState) : "abandoned";
    const currentTask = tasks[taskIndex] ?? taskFixture({ id: taskId });
    const updatedTask = taskFixture({
      ...currentTask,
      state: nextState,
      stateHistory: [
        ...currentTask.stateHistory,
        {
          fromState: currentTask.state,
          toState: nextState,
          actor: "you-this-session",
          reason: String(body.reason ?? "transition"),
          timestampMs: Date.now(),
        },
      ],
    });
    if (taskIndex >= 0) {
      tasks[taskIndex] = updatedTask;
    } else {
      tasks.unshift(updatedTask);
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, task: updatedTask }),
    });
  });

  return {
    dispatchBodies,
    getTasksCount: () => getTasksCount,
    tasks,
    transitionBodies,
  };
}

async function gotoOrganizational(page: Page) {
  await page.goto("/organizational");
  await page.locator(".graph-node").first().waitFor({
    state: "visible",
    timeout: 10000,
  });
}

async function openTasksPanel(page: Page) {
  await tasksButton(page).click();
  await expect(tasksOverlay(page)).toBeVisible();
  await expect(page.getByTestId("tasks-panel")).toBeVisible();
}

async function openComposerFromKeyboard(page: Page) {
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
  });
  await page.keyboard.press("/");
  await expect(page.getByTestId("floating-composer")).toBeVisible();
  await expect(promptInput(page)).toBeFocused();
}

async function submitDirectPrompt(page: Page, prompt: string) {
  await openComposerFromKeyboard(page);
  await page.getByTestId("mode-pill-direct").click();
  await promptInput(page).fill(prompt);
  await submitButton(page).click();
}

test.describe("Tasks integration", () => {
  test("Tasks button visible", async ({ page }) => {
    await setupTasksApi(page);
    await gotoOrganizational(page);

    await expect(tasksButton(page)).toBeVisible();
    await expect(tasksButton(page)).toHaveAttribute("aria-label", "Open Tasks panel");
  });

  test("Click opens Tasks panel", async ({ page }) => {
    await setupTasksApi(page);
    await gotoOrganizational(page);

    await openTasksPanel(page);
  });

  test("Empty state with no tasks", async ({ page }) => {
    const api = await setupTasksApi(page, []);
    await gotoOrganizational(page);

    await openTasksPanel(page);

    await expect.poll(() => api.getTasksCount()).toBeGreaterThan(0);
    await expect(page.getByTestId("tasks-panel-empty")).toHaveText(
      "No tasks dispatched yet.",
    );
  });

  test("Direct mode dispatch POSTs /api/tasks/dispatch", async ({ page }) => {
    const api = await setupTasksApi(page);
    const prompt = "Create a Direct-mode integration task";
    await gotoOrganizational(page);

    await submitDirectPrompt(page, prompt);

    await expect.poll(() => api.dispatchBodies.length).toBe(1);
    expect(api.dispatchBodies[0]).toMatchObject({
      label: prompt.slice(0, 80),
      prompt,
      related_behavior_ids: [],
      request_id: expect.any(String),
    });
  });

  test("Dispatched task appears in panel", async ({ page }) => {
    const api = await setupTasksApi(page);
    const prompt = "Show dispatched task in the Tasks panel";
    await gotoOrganizational(page);

    await submitDirectPrompt(page, prompt);
    await expect.poll(() => api.dispatchBodies.length).toBe(1);
    await openTasksPanel(page);

    await expect(page.getByTestId("task-row-0")).toContainText(prompt);
  });

  test("Cancel transitions via /api/tasks/:id/transition", async ({ page }) => {
    const pendingTask = taskFixture({
      id: "task:pending-cancel",
      label: "Pending cancel task",
      state: "pending",
    });
    const api = await setupTasksApi(page, [pendingTask]);
    await gotoOrganizational(page);

    await openTasksPanel(page);
    await page.getByTestId("task-action-cancel").click();

    await expect.poll(() => api.transitionBodies.length).toBe(1);
    expect(api.transitionBodies[0]).toMatchObject({
      taskId: pendingTask.id,
      body: {
        to_state: "abandoned",
        reason: expect.any(String),
      },
    });
  });

  test("Escape closes Tasks panel", async ({ page }) => {
    await setupTasksApi(page);
    await gotoOrganizational(page);

    await openTasksPanel(page);
    await page.keyboard.press("Escape");

    await expect(tasksOverlay(page)).toBeHidden();
  });

  test("Tasks button count matches non-terminal task count", async ({ page }) => {
    const activeTasks = [
      taskFixture({ id: "task:pending-one", label: "Pending one", state: "pending" }),
      taskFixture({ id: "task:pending-two", label: "Pending two", state: "pending" }),
    ];
    const terminalTasks = Array.from(TERMINAL_STATES, (state) =>
      taskFixture({
        id: `task:${state}`,
        label: `${state} task`,
        state,
      }),
    );
    await setupTasksApi(page, [...activeTasks, ...terminalTasks]);
    await gotoOrganizational(page);

    await expect(tasksButton(page)).toHaveText(/Tasks\s*\(2\)/);
  });
});
