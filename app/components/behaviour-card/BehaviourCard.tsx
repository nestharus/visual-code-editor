import { For, Show, createMemo, createSignal, type JSX } from "solid-js";

import { TrustBadge } from "../TrustBadge";
import type { Behavior, BehaviorSourceSlice } from "../../lib/behavior";

import "./behaviour-card.css";

export type BehaviourCardMode = "view" | "edit";

export interface BehaviourCardProps {
  behaviour: Behavior;
  headerLabel?: string;
  mode?: BehaviourCardMode;
  onToggleMode?: (next: BehaviourCardMode) => void;
  onSliceClick?: (slice: BehaviorSourceSlice) => void;
  onChevronClick?: () => void;
  onCardClick?: () => void;
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

export function BehaviourCard(props: BehaviourCardProps) {
  const [uncontrolledMode, setUncontrolledMode] = createSignal<BehaviourCardMode>("view");
  let rootRef: HTMLElement | undefined;

  const mode = createMemo<BehaviourCardMode>(() => props.mode ?? uncontrolledMode());
  const titleId = createMemo(() => titleIdFor(props.behaviour.id));
  const headerLabel = createMemo(() => props.headerLabel ?? props.behaviour.label);

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

  const handleSliceClick = (
    slice: BehaviorSourceSlice,
  ): JSX.EventHandler<HTMLButtonElement, MouseEvent> => {
    return (event) => {
      event.stopPropagation();
      props.onSliceClick?.(slice);
    };
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
        <div
          class="behaviour-card__edit-banner"
          data-testid="behaviour-card-edit-banner"
          role="status"
        >
          Editing — D writeback machinery lands later.
        </div>
      </Show>

      <div class="behaviour-card__slices" aria-label="Source slices">
        <For each={props.behaviour.sourceSlices}>
          {(slice, index) => {
            const confirmed = () => slice.confirmedBy !== null;

            return (
              <button
                class="behaviour-card__slice"
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
    </article>
  );
}
