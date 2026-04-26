import { Show, createMemo, createSignal, type JSX } from "solid-js";

import "./paired-viewport.css";

const MIN_RATIO = 0.1;
const MAX_RATIO = 0.9;
const DEFAULT_RATIO = 0.5;
const SPLITTER_WIDTH = 6;
const SNAP_DURATION_MS = 200;

export interface PairedGraphViewportProps {
  left: JSX.Element;
  right: JSX.Element;
  ariaLabel: string;
  leftLabel?: string;
  rightLabel?: string;
  initialSplitRatio?: number;
  onSplitChange?: (ratio: number) => void;
}

type DragState = {
  pointerId: number;
  startX: number;
  startRatio: number;
};

function clampRatio(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

function reducedMotionRequested(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PairedGraphViewport(props: PairedGraphViewportProps) {
  const [ratio, setRatio] = createSignal(clampRatio(props.initialSplitRatio));
  const [isDragging, setIsDragging] = createSignal(false);
  const [isSnapping, setIsSnapping] = createSignal(false);
  let rootRef: HTMLDivElement | undefined;
  let dragState: DragState | undefined;
  let pendingKeyboardChange = false;
  let snapTimer: number | undefined;

  const leftAriaLabel = () => props.leftLabel ?? "Left pane";
  const rightAriaLabel = () => props.rightLabel ?? "Right pane";

  const gridStyle = createMemo(() => {
    const currentRatio = ratio();
    const leftWidth = `calc(${currentRatio * 100}% - ${SPLITTER_WIDTH * currentRatio}px)`;
    const rightRatio = 1 - currentRatio;
    const rightWidth = `calc(${rightRatio * 100}% - ${SPLITTER_WIDTH * rightRatio}px)`;

    return {
      "--left-width": leftWidth,
      "--right-width": rightWidth,
      "--split-width": `${SPLITTER_WIDTH}px`,
    } as JSX.CSSProperties;
  });

  const commitRatio = (nextRatio: number): number => {
    const clamped = clampRatio(nextRatio);
    setRatio(clamped);
    return clamped;
  };

  const emitSplitChange = () => {
    props.onSplitChange?.(ratio());
  };

  const clearSnapTimer = () => {
    if (snapTimer !== undefined) {
      window.clearTimeout(snapTimer);
      snapTimer = undefined;
    }
  };

  const showSnapState = () => {
    clearSnapTimer();
    if (reducedMotionRequested()) {
      setIsSnapping(false);
      return;
    }

    setIsSnapping(true);
    snapTimer = window.setTimeout(() => {
      setIsSnapping(false);
      snapTimer = undefined;
    }, SNAP_DURATION_MS);
  };

  const handlePointerDown: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (event.button !== 0) return;

    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startRatio: ratio(),
    };
    clearSnapTimer();
    setIsSnapping(false);
    setIsDragging(true);
    event.preventDefault();
  };

  const handlePointerMove: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId || !rootRef) return;

    const box = rootRef.getBoundingClientRect();
    const resizableWidth = Math.max(1, box.width - SPLITTER_WIDTH);
    const deltaRatio = (event.clientX - dragState.startX) / resizableWidth;
    commitRatio(dragState.startRatio + deltaRatio);
    event.preventDefault();
  };

  const endPointerDrag: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const target = event.currentTarget;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    dragState = undefined;
    setIsDragging(false);
    emitSplitChange();
    event.preventDefault();
  };

  const cancelPointerDrag: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    dragState = undefined;
    setIsDragging(false);
  };

  const handleKeyDown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    let nextRatio: number | undefined;
    let snap = false;

    switch (event.key) {
      case "ArrowLeft":
        nextRatio = ratio() - (event.shiftKey ? 0.1 : 0.01);
        break;
      case "ArrowRight":
        nextRatio = ratio() + (event.shiftKey ? 0.1 : 0.01);
        break;
      case "Home":
        nextRatio = MIN_RATIO;
        break;
      case "End":
        nextRatio = MAX_RATIO;
        break;
      case "Enter":
      case " ":
      case "Spacebar":
        nextRatio = DEFAULT_RATIO;
        snap = true;
        break;
      default:
        return;
    }

    event.preventDefault();
    commitRatio(nextRatio);
    pendingKeyboardChange = true;
    if (snap) showSnapState();
  };

  const handleKeyUp: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "Home":
      case "End":
      case "Enter":
      case " ":
      case "Spacebar":
        event.preventDefault();
        break;
      default:
        return;
    }

    if (!pendingKeyboardChange) return;
    pendingKeyboardChange = false;
    emitSplitChange();
  };

  return (
    <div
      ref={rootRef}
      classList={{
        "paired-graph-viewport": true,
        "is-dragging": isDragging(),
        "is-snapping": isSnapping(),
      }}
      style={gridStyle()}
      role="region"
      aria-label={props.ariaLabel}
    >
      <section class="paired-graph-viewport__pane" role="group" aria-label={leftAriaLabel()}>
        <Show when={props.leftLabel}>
          {(label) => <header class="paired-graph-viewport__header">{label()}</header>}
        </Show>
        <div class="paired-graph-viewport__body">{props.left}</div>
      </section>

      <div
        class="paired-graph-viewport__separator"
        role="separator"
        aria-label="Resize panes"
        aria-orientation="vertical"
        aria-valuemin="10"
        aria-valuemax="90"
        aria-valuenow={Math.round(ratio() * 100)}
        tabindex="0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointerDrag}
        onPointerCancel={cancelPointerDrag}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
      >
        <span class="paired-graph-viewport__separator-line" aria-hidden="true" />
      </div>

      <section class="paired-graph-viewport__pane" role="group" aria-label={rightAriaLabel()}>
        <Show when={props.rightLabel}>
          {(label) => <header class="paired-graph-viewport__header">{label()}</header>}
        </Show>
        <div class="paired-graph-viewport__body">{props.right}</div>
      </section>
    </div>
  );
}
