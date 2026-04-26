import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type JSX,
} from "solid-js";

import { TrustBadge } from "../TrustBadge";
import type { Behavior, BehaviorSourceSlice } from "../../lib/behavior";
import type { ConflictState, WritebackPlan } from "../../lib/writeback";
import { createBehaviourCardEditorState } from "./editor-state";

import "./behaviour-card.css";

export type BehaviourCardMode = "view" | "edit";

export interface BehaviourCardProps {
  behaviour: Behavior;
  headerLabel?: string;
  mode?: BehaviourCardMode;
  getSliceText?: (slice: BehaviorSourceSlice) => Promise<string>;
  parentRevision?: string;
  onToggleMode?: (next: BehaviourCardMode) => void;
  onSliceClick?: (slice: BehaviorSourceSlice) => void;
  onChevronClick?: () => void;
  onCardClick?: () => void;
  onPromoteToTest?: (behaviour: Behavior) => void;
  onSaved?: (plan: WritebackPlan) => void;
  onConflict?: (conflict: ConflictState) => void;
  onError?: (error: { error: string; error_kind: string }) => void;
}

const MODES: readonly BehaviourCardMode[] = ["view", "edit"];

const MODE_LABELS: Record<BehaviourCardMode, string> = {
  view: "View",
  edit: "Edit",
};

function titleIdFor(id: string): string {
  return `card-title-${id.replace(/:/g, "--")}`;
}

function sliceLabel(slice: BehaviorSourceSlice): string {
  return `${slice.filePath}:${slice.startLine}-${slice.endLine}`;
}

interface RouteProposedSlice {
  file_path: string;
  start_line: number;
  end_line: number;
  new_text: string;
  intent_role: string;
}

interface RouteBehaviorDraft {
  id: string;
  behavior_id: string;
  proposed_slices: readonly RouteProposedSlice[];
  origin: {
    actor: "you-this-session";
    intent: "user-edit";
    timestamp_ms: number;
    request_id: null;
  };
  parent_revision: string;
  created_at_ms: number;
}

interface WritebackRouteResponse {
  ok?: boolean;
  plan?: unknown;
  conflict?: unknown;
  error?: string;
  error_kind?: string;
}

function buildDraft(
  behaviour: Behavior,
  sourceSlices: readonly BehaviorSourceSlice[],
  draftTexts: readonly string[],
  initialTexts: readonly string[],
  parentRevision: string,
): RouteBehaviorDraft {
  const now = Date.now();
  const proposedSlices = sourceSlices.flatMap((slice, index): RouteProposedSlice[] => {
    const newText = draftTexts[index] ?? "";
    if (newText === (initialTexts[index] ?? "")) {
      return [];
    }

    return [
      {
        file_path: slice.filePath,
        start_line: slice.startLine,
        end_line: slice.endLine,
        new_text: newText,
        intent_role: slice.sliceRole,
      },
    ];
  });

  return {
    id: `draft:${behaviour.id}:${now}`,
    behavior_id: behaviour.id,
    proposed_slices: proposedSlices,
    origin: {
      actor: "you-this-session",
      intent: "user-edit",
      timestamp_ms: now,
      request_id: null,
    },
    parent_revision: parentRevision,
    created_at_ms: now,
  };
}

function routeErrorPayload(message: string, errorKind = "internal") {
  return { error: message, error_kind: errorKind };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function BehaviourCard(props: BehaviourCardProps) {
  const [uncontrolledMode, setUncontrolledMode] = createSignal<BehaviourCardMode>("view");
  const editor = createBehaviourCardEditorState();
  let rootRef: HTMLElement | undefined;
  let loadRun = 0;
  let savedTimer: number | undefined;

  const mode = createMemo<BehaviourCardMode>(() => props.mode ?? uncontrolledMode());
  const titleId = createMemo(() => titleIdFor(props.behaviour.id));
  const headerLabel = createMemo(() => props.headerLabel ?? props.behaviour.label);
  const hasModifiedDrafts = createMemo(() => {
    return editor.draftTexts().some((text, index) => text !== (editor.initialTexts()[index] ?? ""));
  });
  const isBusy = createMemo(() => {
    const banner = editor.banner().kind;
    return banner === "loading" || banner === "saving";
  });
  const canSave = createMemo(() => {
    return Boolean(props.getSliceText && props.parentRevision) && hasModifiedDrafts() && !isBusy();
  });
  const canPromoteToTest = createMemo(() => {
    return props.behaviour.trust.state === "candidate" && typeof props.onPromoteToTest === "function";
  });

  onCleanup(() => {
    if (savedTimer !== undefined) {
      window.clearTimeout(savedTimer);
    }
  });

  const selectMode = (nextMode: BehaviourCardMode) => {
    if (mode() === nextMode) return;

    if (props.mode === undefined) {
      setUncontrolledMode(nextMode);
    }
    props.onToggleMode?.(nextMode);
  };

  const focusMode = (nextMode: BehaviourCardMode) => {
    rootRef
      ?.querySelector<HTMLButtonElement>(`[data-testid="behaviour-card-mode-radio-${nextMode}"]`)
      ?.focus();
  };

  const handleModeKeyDown = (
    event: KeyboardEvent,
    currentMode: BehaviourCardMode,
  ) => {
    let direction: -1 | 1 | undefined;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        direction = 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        direction = -1;
        break;
      case "Home":
        event.preventDefault();
        event.stopPropagation();
        selectMode(MODES[0]);
        focusMode(MODES[0]);
        return;
      case "End":
        event.preventDefault();
        event.stopPropagation();
        selectMode(MODES[MODES.length - 1]);
        focusMode(MODES[MODES.length - 1]);
        return;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    const currentIndex = MODES.indexOf(currentMode);
    const nextMode = MODES[(Math.max(0, currentIndex) + direction + MODES.length) % MODES.length];
    selectMode(nextMode);
    focusMode(nextMode);
  };

  const stopPropagation: JSX.EventHandler<HTMLElement, Event> = (event) => {
    event.stopPropagation();
  };

  const handleCardClick: JSX.EventHandler<HTMLElement, MouseEvent> = () => {
    props.onCardClick?.();
  };

  const handleChevronClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    event.stopPropagation();
    props.onChevronClick?.();
  };

  const handlePromoteToTest: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    event.stopPropagation();
    props.onPromoteToTest?.(props.behaviour);
  };

  const handleSliceClick = (
    slice: BehaviorSourceSlice,
  ): JSX.EventHandler<HTMLButtonElement, MouseEvent> => {
    return (event) => {
      event.stopPropagation();
      props.onSliceClick?.(slice);
    };
  };

  const loadSliceTexts = async () => {
    if (!props.getSliceText) {
      editor.reset();
      editor.setBanner({ kind: "unavailable" });
      return;
    }

    const currentRun = ++loadRun;
    editor.setBanner({ kind: "loading" });

    try {
      const texts = await Promise.all(
        props.behaviour.sourceSlices.map((slice) => props.getSliceText?.(slice) ?? ""),
      );
      if (currentRun !== loadRun || mode() !== "edit") {
        return;
      }
      editor.replaceTexts(texts);
      editor.setBanner({ kind: "idle" });
    } catch (error) {
      if (currentRun !== loadRun || mode() !== "edit") {
        return;
      }
      const payload = routeErrorPayload(errorMessage(error), "source-fetch");
      editor.setBanner({ kind: "error", message: payload.error });
      props.onError?.(payload);
    }
  };

  createEffect(() => {
    if (mode() !== "edit") {
      loadRun += 1;
      editor.reset();
      return;
    }

    void loadSliceTexts();
  });

  const handleCancel: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    event.stopPropagation();
    editor.reset();
    selectMode("view");
  };

  const handleReload: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    event.stopPropagation();
    void loadSliceTexts();
  };

  const handleSave: JSX.EventHandler<HTMLButtonElement, MouseEvent> = async (event) => {
    event.stopPropagation();
    if (!canSave()) {
      return;
    }

    const draft = buildDraft(
      props.behaviour,
      props.behaviour.sourceSlices,
      editor.draftTexts(),
      editor.initialTexts(),
      props.parentRevision ?? "",
    );

    editor.setBanner({ kind: "saving" });

    try {
      const response = await fetch("/api/writeback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ draft, apply: true }),
      });
      const data = (await response.json()) as WritebackRouteResponse;

      if (data.ok && data.plan) {
        editor.setBanner({ kind: "saved" });
        props.onSaved?.(data.plan as WritebackPlan);
        savedTimer = window.setTimeout(() => {
          selectMode("view");
        }, 1500);
        return;
      }

      if (data.conflict) {
        editor.setBanner({ kind: "conflict" });
        props.onConflict?.(data.conflict as ConflictState);
        return;
      }

      const payload = routeErrorPayload(
        data.error ?? (response.ok ? "Writeback failed" : `Writeback failed (${response.status})`),
        data.error_kind ?? "internal",
      );
      editor.setBanner({ kind: "error", message: payload.error });
      props.onError?.(payload);
    } catch (error) {
      const payload = routeErrorPayload(errorMessage(error));
      editor.setBanner({ kind: "error", message: payload.error });
      props.onError?.(payload);
    }
  };

  return (
    <article
      ref={rootRef}
      class="behaviour-card"
      data-testid="behaviour-card"
      role="article"
      aria-labelledby={titleId()}
      onClick={handleCardClick}
    >
      <header class="behaviour-card__header">
        <div class="behaviour-card__title-row">
          <TrustBadge
            state={props.behaviour.trust.state}
            grounding={props.behaviour.trust.grounding}
            size="md"
          />
          <Show when={canPromoteToTest()}>
            <button
              class="behaviour-card__promote-button"
              data-testid="behaviour-card-promote-to-test"
              type="button"
              aria-label={`Promote ${props.behaviour.label} to test`}
              onClick={handlePromoteToTest}
            >
              Promote to test
            </button>
          </Show>
          <h3
            id={titleId()}
            class="behaviour-card__title"
            data-testid="behaviour-card-header-label"
          >
            {headerLabel()}
          </h3>
        </div>

        <button
          class="behaviour-card__chevron"
          data-testid="behaviour-card-chevron"
          type="button"
          aria-label={`Open ${headerLabel()} contents`}
          onClick={handleChevronClick}
        >
          <span aria-hidden="true">›</span>
        </button>
      </header>

      <Show when={props.behaviour.description}>
        {(description) => (
          <p class="behaviour-card__description" data-testid="behaviour-card-description">
            {description()}
          </p>
        )}
      </Show>

      <div
        class="behaviour-card__mode-toggle"
        data-testid="behaviour-card-mode-toggle"
        role="radiogroup"
        aria-label="Behaviour card mode"
        onClick={stopPropagation}
      >
        <For each={MODES}>
          {(nextMode) => (
            <button
              classList={{
                "behaviour-card__mode-radio": true,
                "is-selected": mode() === nextMode,
              }}
              data-testid={`behaviour-card-mode-radio-${nextMode}`}
              type="button"
              role="radio"
              aria-checked={mode() === nextMode}
              tabindex={mode() === nextMode ? 0 : -1}
              onClick={(event) => {
                event.stopPropagation();
                selectMode(nextMode);
              }}
              onKeyDown={(event) => handleModeKeyDown(event, nextMode)}
            >
              {MODE_LABELS[nextMode]}
            </button>
          )}
        </For>
      </div>

      <Show when={mode() === "edit"}>
        <div class="behaviour-card__editor" onClick={stopPropagation}>
          <Show when={!props.getSliceText}>
            <div
              class="behaviour-card__edit-banner"
              data-testid="behaviour-card-edit-banner"
              role="status"
            >
              Editing — D writeback machinery lands later.
            </div>
          </Show>

          <Show when={editor.banner().kind === "loading"}>
            <div
              class="behaviour-card__status-banner"
              data-testid="behaviour-card-status-banner"
              role="status"
            >
              <span class="behaviour-card__spinner" aria-hidden="true" />
              Loading slice content…
            </div>
          </Show>

          <Show when={editor.banner().kind === "unavailable"}>
            <div
              class="behaviour-card__status-banner is-alert"
              data-testid="behaviour-card-status-banner"
              role="alert"
            >
              Slice content unavailable
            </div>
          </Show>

          <Show when={props.getSliceText && editor.banner().kind !== "loading"}>
            <div class="behaviour-card__slice-editors" aria-label="Editable source slices">
              <For each={props.behaviour.sourceSlices}>
                {(slice, index) => (
                  <label class="behaviour-card__slice-editor">
                    <span class="behaviour-card__slice-editor-header">
                      <span class="behaviour-card__slice-editor-path">{sliceLabel(slice)}</span>
                      <span class="behaviour-card__slice-role">{slice.sliceRole}</span>
                    </span>
                    <textarea
                      class="behaviour-card__textarea"
                      data-testid={`behaviour-card-slice-editor-${index()}`}
                      aria-label={`Edit ${slice.filePath} lines ${slice.startLine}-${slice.endLine}`}
                      spellcheck={false}
                      value={editor.draftTexts()[index()] ?? ""}
                      disabled={isBusy()}
                      onInput={(event) => {
                        editor.updateDraftText(index(), event.currentTarget.value);
                      }}
                    />
                  </label>
                )}
              </For>
            </div>
          </Show>

          <div class="behaviour-card__edit-actions">
            <button
              class="behaviour-card__action-button is-primary"
              data-testid="behaviour-card-save-button"
              type="button"
              disabled={!canSave()}
              aria-busy={editor.banner().kind === "saving" ? "true" : "false"}
              onClick={handleSave}
            >
              Save
            </button>
            <button
              class="behaviour-card__action-button"
              data-testid="behaviour-card-cancel-button"
              type="button"
              disabled={isBusy()}
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>

          <Show when={editor.banner().kind === "saving"}>
            <div
              class="behaviour-card__status-banner"
              data-testid="behaviour-card-status-banner"
              role="status"
            >
              <span class="behaviour-card__spinner" aria-hidden="true" />
              Saving…
            </div>
          </Show>

          <Show when={editor.banner().kind === "saved"}>
            <div
              class="behaviour-card__status-banner is-success"
              data-testid="behaviour-card-status-banner"
              role="status"
            >
              Saved
            </div>
          </Show>

          <Show when={editor.banner().kind === "conflict"}>
            <div
              class="behaviour-card__status-banner is-alert"
              data-testid="behaviour-card-status-banner"
              role="alert"
            >
              <span>Source has changed since you started editing</span>
              <button
                class="behaviour-card__inline-button"
                data-testid="behaviour-card-reload-button"
                type="button"
                onClick={handleReload}
              >
                Reload
              </button>
            </div>
          </Show>

          <Show when={editor.banner().kind === "error"}>
            <div
              class="behaviour-card__status-banner is-alert"
              data-testid="behaviour-card-status-banner"
              role="alert"
            >
              {(() => {
                const banner = editor.banner();
                return banner.kind === "error" ? banner.message : "";
              })()}
            </div>
          </Show>
        </div>
      </Show>

      <Show when={mode() === "view"}>
        <div class="behaviour-card__slices" aria-label="Source slices">
          <For each={props.behaviour.sourceSlices}>
            {(slice, index) => {
              const confirmed = () => slice.confirmedBy !== null;

              return (
                <button
                  class="behaviour-card__slice behaviour-card-slice"
                  data-testid={`behaviour-card-slice-${index()}`}
                  data-confirmed={String(confirmed())}
                  type="button"
                  role="button"
                  aria-label={`Open ${slice.filePath} lines ${slice.startLine}-${slice.endLine}`}
                  onClick={handleSliceClick(slice)}
                >
                  <span
                    classList={{
                      "behaviour-card__slice-dot": true,
                      "is-confirmed": confirmed(),
                    }}
                    aria-hidden="true"
                  />
                  <span class="behaviour-card__slice-role">{slice.sliceRole}</span>
                  <span class="behaviour-card__slice-path">{sliceLabel(slice)}</span>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </article>
  );
}
