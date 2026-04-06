import { Show, createSignal, onCleanup } from "solid-js";

type DeepCardOverlayProps = {
  active: boolean;
  direction: "forward" | "reverse";
  sourceRect: DOMRect | null;
  destinationRect?: { left: number; top: number; width: number; height: number } | null;
  viewportWidth: number;
  viewportHeight: number;
  onComplete: () => void;
};

type Phase = "idle" | "expand" | "tunnel" | "dissolve";

function clampOrigin(value: number, size: number): number {
  const min = size * 0.2;
  const max = size * 0.8;
  return Math.max(min, Math.min(max, value));
}

export function DeepCardOverlay(props: DeepCardOverlayProps) {
  const [phase, setPhase] = createSignal<Phase>("idle");
  let timer: number | undefined;

  const cleanup = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  onCleanup(cleanup);

  const startForward = () => {
    cleanup();
    setPhase("expand");
    timer = window.setTimeout(() => {
      setPhase("tunnel");
      timer = window.setTimeout(() => {
        setPhase("dissolve");
        timer = window.setTimeout(() => {
          setPhase("idle");
          props.onComplete();
        }, 300);
      }, 400);
    }, 200);
  };

  const startReverse = () => {
    cleanup();
    // Start from tunnel state (full frame), pull back, then dissolve
    setPhase("tunnel");
    timer = window.setTimeout(() => {
      setPhase("expand");
      timer = window.setTimeout(() => {
        setPhase("dissolve");
        timer = window.setTimeout(() => {
          setPhase("idle");
          props.onComplete();
        }, 200);
      }, 400);
    }, 100);
  };

  const wasActive = { value: false };
  const checkActive = () => {
    if (props.active && !wasActive.value) {
      wasActive.value = true;
      if (props.direction === "reverse") {
        startReverse();
      } else {
        startForward();
      }
    } else if (!props.active) {
      wasActive.value = false;
      cleanup();
      setPhase("idle");
    }
  };

  checkActive();

  const activeRect = () => {
    if (props.direction === "reverse" && phase() === "expand" && props.destinationRect) {
      return props.destinationRect;
    }
    return props.sourceRect;
  };

  const rect = () => activeRect();

  const originX = () => {
    const r = props.sourceRect;
    return r ? clampOrigin(r.left + r.width / 2, props.viewportWidth) : props.viewportWidth / 2;
  };
  const originY = () => {
    const r = props.sourceRect;
    return r ? clampOrigin(r.top + r.height / 2, props.viewportHeight) : props.viewportHeight / 2;
  };

  const isReverse = () => props.direction === "reverse";

  return (
    <Show when={phase() !== "idle" && (rect() || isReverse())}>
      <div
        class="deep-card-overlay"
        classList={{
          "phase-expand": phase() === "expand",
          "phase-tunnel": phase() === "tunnel",
          "phase-dissolve": phase() === "dissolve",
          "direction-reverse": isReverse(),
        }}
        style={{
          perspective: "800px",
          "perspective-origin": `${originX()}px ${originY()}px`,
        }}
      >
        <div
          class="deep-card-shell"
          style={{
            left: rect() ? `${rect()!.left}px` : "10%",
            top: rect() ? `${rect()!.top}px` : "10%",
            width: rect() ? `${rect()!.width}px` : "80%",
            height: rect() ? `${rect()!.height}px` : "80%",
          }}
        >
          <div class="deep-card-wall deep-card-wall--left" />
          <div class="deep-card-wall deep-card-wall--right" />
          <div class="deep-card-wall deep-card-wall--top" />
          <div class="deep-card-wall deep-card-wall--bottom" />
        </div>
        <div class="deep-card-vignette" />
      </div>
    </Show>
  );
}
