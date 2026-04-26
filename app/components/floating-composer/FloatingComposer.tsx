import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type JSX,
} from "solid-js";

import type { AnchorKind, SelectionScope } from "../../lib/anchor";
import { createOverlayFocus } from "../../lib/a11y/createOverlayFocus";

import "./floating-composer.css";

export type ComposerMode = "ask" | "edit" | "direct";

export interface ComposerSubmission {
  mode: ComposerMode;
  prompt: string;
  selection: SelectionScope;
  surfaceAnchor: AnchorKind;
}

export type ComposerResult =
  | { kind: "answer"; text: string }
  | { kind: "edit"; text: string; patch: string }
  | { kind: "direct"; text: string };

export interface FloatingComposerProps {
  selection: SelectionScope;
  surfaceAnchor: AnchorKind;
  anchorRect: DOMRectReadOnly | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: ComposerSubmission) => void;
  enabledModes?: readonly ComposerMode[];
  initialMode?: ComposerMode;
  result?: ComposerResult | null;
  error?: string;
  isSubmitting?: boolean;
}

type Size = {
  width: number;
  height: number;
};

type Position = {
  left: number;
  top: number;
};

const MODES: readonly ComposerMode[] = ["ask", "edit", "direct"];
const PLACEMENT_GAP = 12;
const EDGE_PADDING = 0;
const MAX_TEXTAREA_LINES = 8;
const DEFAULT_LINE_HEIGHT_PX = 18;
const TABBABLE_SELECTOR =
  'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

const MODE_LABELS: Record<ComposerMode, string> = {
  ask: "Ask",
  edit: "Edit",
  direct: "Direct",
};

const MODE_SUMMARY_LABELS: Record<ComposerMode, string> = {
  ask: "Asking about",
  edit: "Editing",
  direct: "Directing",
};

const ANCHOR_LABELS: Record<AnchorKind, string> = {
  "behaviour-card": "behaviour card",
  "code-block": "code block",
  edge: "edge",
  node: "node",
  "pr-delta": "PR delta",
  screen: "screen",
  section: "section",
  "selection-box": "selection box",
  slice: "slice",
  task: "Task",
  widget: "widget",
};

function rectEdges(rect: DOMRectReadOnly) {
  const left = rect.left ?? rect.x;
  const top = rect.top ?? rect.y;

  return {
    bottom: rect.bottom ?? top + rect.height,
    left,
    right: rect.right ?? left + rect.width,
    top,
  };
}

function fits(position: Position, size: Size, viewport: Size): boolean {
  return (
    position.left >= EDGE_PADDING &&
    position.top >= EDGE_PADDING &&
    position.left + size.width <= viewport.width - EDGE_PADDING &&
    position.top + size.height <= viewport.height - EDGE_PADDING
  );
}

export function computeFloatingComposerPosition(
  anchorRect: DOMRectReadOnly,
  composerSize: Size,
  viewportSize: Size,
): Position {
  const anchor = rectEdges(anchorRect);
  const placements: readonly Position[] = [
    {
      left: anchor.right + PLACEMENT_GAP,
      top: anchor.bottom + PLACEMENT_GAP,
    },
    {
      left: anchor.right + PLACEMENT_GAP,
      top: anchor.top - PLACEMENT_GAP - composerSize.height,
    },
    {
      left: anchor.left - PLACEMENT_GAP - composerSize.width,
      top: anchor.top - PLACEMENT_GAP - composerSize.height,
    },
    {
      left: anchor.left - PLACEMENT_GAP - composerSize.width,
      top: anchor.bottom + PLACEMENT_GAP,
    },
  ];

  return (
    placements.find((placement) => fits(placement, composerSize, viewportSize)) ?? {
      left: Math.max(EDGE_PADDING, viewportSize.width - composerSize.width - EDGE_PADDING),
      top: Math.max(EDGE_PADDING, viewportSize.height - composerSize.height - EDGE_PADDING),
    }
  );
}

function reducedMotionRequested(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function enabledModeSet(enabledModes: readonly ComposerMode[] | undefined): ReadonlySet<ComposerMode> {
  const allowed = new Set<ComposerMode>();

  for (const mode of enabledModes ?? MODES) {
    if (MODES.includes(mode)) {
      allowed.add(mode);
    }
  }

  if (allowed.size === 0) {
    allowed.add("ask");
  }

  return allowed;
}

function firstEnabledMode(enabled: ReadonlySet<ComposerMode>): ComposerMode {
  return MODES.find((mode) => enabled.has(mode)) ?? "ask";
}

function selectionSummary(selection: SelectionScope): string {
  const count = selection.items.length;
  const countLabel = `${count} ${count === 1 ? "item" : "items"}`;
  const ids = selection.items.map((item) => item.id).filter(Boolean);

  return ids.length > 0 ? `${countLabel}: ${ids.join(", ")}` : countLabel;
}

function editResult(result: ComposerResult): Extract<ComposerResult, { kind: "edit" }> | null {
  return result.kind === "edit" ? result : null;
}

function resizeTextarea(textarea: HTMLTextAreaElement | undefined): void {
  if (!textarea) return;

  const computed = window.getComputedStyle(textarea);
  const parsedLineHeight = Number.parseFloat(computed.lineHeight);
  const lineHeight = Number.isFinite(parsedLineHeight)
    ? parsedLineHeight
    : DEFAULT_LINE_HEIGHT_PX;
  const borderAndPadding = textarea.offsetHeight - textarea.clientHeight;
  const maxHeight = lineHeight * MAX_TEXTAREA_LINES + borderAndPadding;

  textarea.style.height = "auto";
  textarea.style.maxHeight = `${maxHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
}

function isFocusableElement(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest("[hidden]")) return false;
  if (element.getClientRects().length === 0) return false;

  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

function getTabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    isFocusableElement,
  );
}

export function FloatingComposer(props: FloatingComposerProps) {
  const [mode, setMode] = createSignal<ComposerMode>("ask");
  const [prompt, setPrompt] = createSignal("");
  const [position, setPosition] = createSignal<Position>({ left: 0, top: 0 });
  const [isPositioned, setIsPositioned] = createSignal(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = createSignal(false);
  let rootRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;

  const isVisible = () => props.open && props.anchorRect !== null;
  const enabled = createMemo(() => enabledModeSet(props.enabledModes));
  const isModeEnabled = (nextMode: ComposerMode) => enabled().has(nextMode);

  const syncMode = () => {
    const allowed = enabled();
    const requested = props.initialMode;
    setMode(requested && allowed.has(requested) ? requested : firstEnabledMode(allowed));
  };

  const updatePosition = () => {
    if (!isVisible() || !props.anchorRect || !rootRef) {
      setIsPositioned(false);
      return;
    }

    const rootBox = rootRef.getBoundingClientRect();
    const nextPosition = computeFloatingComposerPosition(
      props.anchorRect,
      {
        height: rootBox.height,
        width: rootBox.width,
      },
      {
        height: window.innerHeight,
        width: window.innerWidth,
      },
    );

    setPosition(nextPosition);
    setIsPositioned(true);
  };

  createOverlayFocus({
    isOpen: isVisible,
    getRoot: () => rootRef,
    getFocusTarget: () => textareaRef ?? null,
    onEscape: props.onClose,
  });

  createEffect((wasVisible = false) => {
    const visible = isVisible();

    if (visible && !wasVisible) {
      syncMode();
      setPrefersReducedMotion(reducedMotionRequested());
      queueMicrotask(() => {
        resizeTextarea(textareaRef);
        updatePosition();
      });
    }

    if (!visible) {
      setIsPositioned(false);
    }

    return visible;
  });

  createEffect(() => {
    enabled();
    if (isVisible() && !isModeEnabled(mode())) {
      setMode(firstEnabledMode(enabled()));
    }
  });

  createEffect(() => {
    props.result;
    props.error;
    props.isSubmitting;
    if (isVisible()) {
      queueMicrotask(updatePosition);
    }
  });

  createEffect(() => {
    if (!isVisible()) return;

    const handleFocusTrapKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Tab" || !rootRef) return;

      const tabbables = getTabbables(rootRef);
      if (tabbables.length === 0) return;

      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const currentIndex = activeElement ? tabbables.indexOf(activeElement) : -1;
      const fallbackIndex = event.shiftKey ? tabbables.length - 1 : 0;
      const nextIndex =
        currentIndex === -1
          ? fallbackIndex
          : (currentIndex + (event.shiftKey ? -1 : 1) + tabbables.length) %
            tabbables.length;

      event.preventDefault();
      tabbables[nextIndex]?.focus();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!rootRef || !(target instanceof Node)) return;
      if (!rootRef.contains(target)) {
        props.onClose();
      }
    };

    const handleResize = () => updatePosition();

    document.addEventListener("keydown", handleFocusTrapKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleResize);

    onCleanup(() => {
      document.removeEventListener("keydown", handleFocusTrapKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleResize);
    });
  });

  const rootStyle = createMemo<JSX.CSSProperties>(() => ({
    left: `${position().left}px`,
    top: `${position().top}px`,
  }));

  const submitPrompt = () => {
    const currentPrompt = prompt();
    if (currentPrompt.trim() === "") return;

    props.onSubmit({
      mode: mode(),
      prompt: currentPrompt,
      selection: props.selection,
      surfaceAnchor: props.surfaceAnchor,
    });
    setPrompt("");
    queueMicrotask(() => resizeTextarea(textareaRef));
  };

  const handleSubmit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (event) => {
    event.preventDefault();
    submitPrompt();
  };

  const handlePromptInput: JSX.EventHandler<HTMLTextAreaElement, InputEvent> = (event) => {
    setPrompt(event.currentTarget.value);
    resizeTextarea(event.currentTarget);
    queueMicrotask(updatePosition);
  };

  const handlePromptKeyDown: JSX.EventHandler<HTMLTextAreaElement, KeyboardEvent> = (event) => {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;

    event.preventDefault();
    submitPrompt();
  };

  const selectMode = (nextMode: ComposerMode) => {
    if (!isModeEnabled(nextMode)) return;
    setMode(nextMode);
  };

  const focusMode = (nextMode: ComposerMode) => {
    const button = rootRef?.querySelector<HTMLButtonElement>(
      `[data-testid="mode-pill-${nextMode}"]`,
    );
    button?.focus();
  };

  const handleModeKeyDown = (
    event: KeyboardEvent,
    currentMode: ComposerMode,
  ) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

    const allowed = MODES.filter((nextMode) => isModeEnabled(nextMode));
    if (allowed.length === 0) return;

    event.preventDefault();
    const currentIndex = allowed.indexOf(currentMode);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextMode =
      allowed[(Math.max(0, currentIndex) + direction + allowed.length) % allowed.length];
    selectMode(nextMode);
    focusMode(nextMode);
  };

  const anchorInfoText = createMemo(
    () =>
      `${MODE_SUMMARY_LABELS[mode()]} ${ANCHOR_LABELS[props.surfaceAnchor]} ${selectionSummary(
        props.selection,
      )}`,
  );

  return (
    <Show when={isVisible()}>
      <div
        ref={rootRef}
        classList={{
          "floating-composer": true,
          "is-positioned": isPositioned(),
          "is-reduced-motion": prefersReducedMotion(),
        }}
        style={rootStyle()}
        role="dialog"
        aria-modal="true"
        aria-label="Prompt composer"
        data-testid="floating-composer"
      >
        <div
          class="floating-composer__anchor-info"
          data-testid="anchor-info-row"
          aria-live="polite"
        >
          {anchorInfoText()}
        </div>

        <form class="floating-composer__form" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            class="floating-composer__prompt"
            data-testid="prompt-input"
            aria-label="Prompt"
            rows={1}
            value={prompt()}
            onInput={handlePromptInput}
            onKeyDown={handlePromptKeyDown}
          />

          <button
            class="floating-composer__submit"
            data-testid="submit-button"
            type="submit"
            disabled={props.isSubmitting || prompt().trim() === ""}
          >
            {props.isSubmitting ? "Submitting" : "Submit"}
          </button>

          <div
            class="floating-composer__modes"
            role="radiogroup"
            aria-label="Composer mode"
          >
            <For each={MODES}>
              {(nextMode) => (
                <button
                  classList={{
                    "floating-composer__mode": true,
                    "is-selected": mode() === nextMode,
                  }}
                  data-testid={`mode-pill-${nextMode}`}
                  type="button"
                  role="radio"
                  aria-checked={mode() === nextMode}
                  disabled={!isModeEnabled(nextMode)}
                  tabindex={mode() === nextMode ? 0 : -1}
                  onClick={() => selectMode(nextMode)}
                  onKeyDown={(event) => handleModeKeyDown(event, nextMode)}
                >
                  {MODE_LABELS[nextMode]}
                </button>
              )}
            </For>
          </div>

          <button
            class="floating-composer__close"
            data-testid="close-button"
            type="button"
            aria-label="Close prompt composer"
            onClick={props.onClose}
          >
            Close
          </button>
        </form>

        <Show when={props.error}>
          {(error) => (
            <p class="floating-composer__error" role="alert">
              {error()}
            </p>
          )}
        </Show>

        <Show when={props.result}>
          {(result) => (
            <div class="floating-composer__result" aria-live="polite">
              <Show
                when={editResult(result())}
                fallback={
                  <p class="floating-composer__result-text">
                    {result().kind === "direct"
                      ? `Dispatched: ${result().text}`
                      : result().text}
                  </p>
                }
              >
                {(edit) => (
                  <>
                    <p class="floating-composer__result-text">{edit().text}</p>
                    <pre class="floating-composer__patch"><code>{edit().patch}</code></pre>
                    <button
                      type="button"
                      class="floating-composer__copy"
                      onClick={() => navigator.clipboard?.writeText(edit().patch)}
                    >
                      Copy
                    </button>
                  </>
                )}
              </Show>
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
}
