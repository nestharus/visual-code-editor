import { For, Show, createMemo, type JSX } from "solid-js";

import type { Task, TaskState } from "../../lib/task";

import "./tasks-panel.css";

export interface TasksPanelProps {
  tasks: readonly Task[];
  onTransition: (taskId: string, toState: TaskState, reason: string) => void;
  onOpenTask: (taskId: string) => void;
  emptyMessage?: string;
}

const TERMINAL_STATES: ReadonlySet<TaskState> = new Set([
  "merged",
  "abandoned",
  "failed",
]);

function formatAge(createdAtMs: number, nowMs = Date.now()): string {
  const elapsedMs = Math.max(0, nowMs - createdAtMs);
  const elapsedMinutes = Math.max(1, Math.floor(elapsedMs / 60_000));

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  return `${Math.floor(elapsedHours / 24)}d ago`;
}

function transitionHandler(
  onTransition: TasksPanelProps["onTransition"],
  task: Task,
  toState: TaskState,
  reason: string,
): JSX.EventHandler<HTMLButtonElement, MouseEvent> {
  return (event) => {
    event.stopPropagation();
    onTransition(task.id, toState, reason);
  };
}

function stopPropagation(event: MouseEvent): void {
  event.stopPropagation();
}

function TaskActions(props: { task: Task; onTransition: TasksPanelProps["onTransition"] }) {
  return (
    <div class="tasks-panel__actions" aria-label={`Actions for ${props.task.label}`}>
      <Show when={props.task.state === "pending"}>
        <button
          class="tasks-panel__action-button"
          data-testid="task-action-cancel"
          type="button"
          onClick={transitionHandler(props.onTransition, props.task, "abandoned", "User cancelled")}
        >
          Cancel
        </button>
      </Show>

      <Show when={props.task.state === "running"}>
        <button
          class="tasks-panel__action-button"
          data-testid="task-action-pause"
          type="button"
          onClick={transitionHandler(props.onTransition, props.task, "paused", "User paused")}
        >
          Pause
        </button>
      </Show>

      <Show when={props.task.state === "paused"}>
        <button
          class="tasks-panel__action-button"
          data-testid="task-action-resume"
          type="button"
          onClick={transitionHandler(props.onTransition, props.task, "running", "User resumed")}
        >
          Resume
        </button>
        <button
          class="tasks-panel__action-button"
          data-testid="task-action-cancel"
          type="button"
          onClick={transitionHandler(props.onTransition, props.task, "abandoned", "User cancelled")}
        >
          Cancel
        </button>
      </Show>

      <Show when={props.task.state === "ready-for-pr"}>
        <button
          class="tasks-panel__action-button is-primary"
          data-testid="task-action-promote-to-pr"
          type="button"
          onClick={transitionHandler(props.onTransition, props.task, "in-pr", "User promoted to PR")}
        >
          Promote to PR
        </button>
        <button
          class="tasks-panel__action-button"
          data-testid="task-action-cancel"
          type="button"
          onClick={transitionHandler(props.onTransition, props.task, "abandoned", "User cancelled")}
        >
          Cancel
        </button>
      </Show>

      <Show when={props.task.state === "in-pr" && props.task.prUrl}>
        {(prUrl) => (
          <a
            class="tasks-panel__action-button"
            data-testid="task-action-view-pr"
            href={prUrl()}
            target="_blank"
            rel="noopener"
            onClick={stopPropagation}
          >
            View PR
          </a>
        )}
      </Show>
    </div>
  );
}

export function TasksPanel(props: TasksPanelProps) {
  const activeCount = createMemo(() => {
    return props.tasks.filter((task) => !TERMINAL_STATES.has(task.state)).length;
  });

  return (
    <section
      class="tasks-panel"
      data-testid="tasks-panel"
      role="region"
      aria-label="Tasks"
    >
      <header class="tasks-panel__header" data-testid="tasks-panel-header">
        Tasks ({activeCount()} active)
      </header>

      <Show
        when={props.tasks.length > 0}
        fallback={
          <p class="tasks-panel__empty" data-testid="tasks-panel-empty">
            {props.emptyMessage ?? "No tasks dispatched yet."}
          </p>
        }
      >
        <ul class="tasks-panel__list" role="list">
          <For each={props.tasks}>
            {(task, index) => (
              <li
                class="tasks-panel__item"
                data-testid={`task-row-${index()}`}
                role="listitem"
                onClick={() => props.onOpenTask(task.id)}
              >
                <div class="tasks-panel__row-main">
                  <div class="tasks-panel__title-line">
                    <span
                      class={`tasks-panel__state task-state--${task.state}`}
                      data-testid={`task-state-badge-${index()}`}
                      aria-label={`State: ${task.state}`}
                    >
                      {task.state}
                    </span>
                    <span class="tasks-panel__label" title={task.label}>
                      {task.label}
                    </span>
                  </div>
                  <div class="tasks-panel__subline">
                    <span>{formatAge(task.createdAtMs)}</span>
                    <span aria-hidden="true">•</span>
                    <span class="tasks-panel__branch" title={task.worktree.branch}>
                      {task.worktree.branch}
                    </span>
                  </div>
                </div>

                <TaskActions task={task} onTransition={props.onTransition} />
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}
