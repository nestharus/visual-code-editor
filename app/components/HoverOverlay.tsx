import type { Core, EventObject, NodeSingular } from "cytoscape";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { getNodeVisual, getIconSvgByKind, nodeVisuals } from "../lib/node-visuals";
import "../styles/hover-overlay.css";

type HoverOverlayProps = {
  cy: Core | undefined;
  container: HTMLDivElement | undefined;
};

type HoverPhase = "grounded" | "lifting" | "floating" | "settling";

type HoverCard = {
  token: number;
  node: NodeSingular;
  label: string;
  nodeType: string;
  shape: string;
  borderColor: string;
  backgroundColor: string;
  textColor: string;
  fontSize: string;
  x: number;
  y: number;
  width: number;
  height: number;
  phase: HoverPhase;
};

const LIFT_DURATION_MS = 600;
const SETTLE_DURATION_MS = 1200;

function readNodeGeometry(node: NodeSingular) {
  const bb = node.renderedBoundingBox();
  return {
    x: bb.x1,
    y: bb.y1,
    width: bb.w,
    height: bb.h,
  };
}

function readNodeLabel(node: NodeSingular) {
  const label = node.data("label");
  return typeof label === "string" ? label : node.id();
}

function readNodeStyle(node: NodeSingular, key: string, fallback: string) {
  const styleValue = node.style(key);
  return typeof styleValue === "string" && styleValue.length > 0 ? styleValue : fallback;
}

function readRenderedStyle(node: NodeSingular, key: string, fallback: string) {
  const styleValue = node.renderedStyle(key);
  return typeof styleValue === "string" && styleValue.length > 0 ? styleValue : fallback;
}

function readBorderColor(node: NodeSingular) {
  const dataColor = node.data("color");
  if (typeof dataColor === "string" && dataColor.length > 0) return dataColor;
  return readNodeStyle(node, "border-color", "#58a6ff");
}

export function HoverOverlay(props: HoverOverlayProps) {
  const [card, setCard] = createSignal<HoverCard | null>(null);

  let phaseTimer: ReturnType<typeof setTimeout> | undefined;
  let hiddenNode: NodeSingular | null = null;
  let token = 0;
  let driftRafId: number | undefined;
  let driftToken = 0;
  let driftPose = { x: 0, y: -8, rotation: 0 };
  let driftVelocity = { x: 0, y: 0, rotation: 0 };
  let driftTarget = { x: 0, y: -8, rotation: 0 };
  let driftLastTime = 0;
  let cardEl: HTMLDivElement | null = null;
  let bodyEl: HTMLDivElement | null = null;

  const clearPhaseTimer = () => {
    if (!phaseTimer) return;
    clearTimeout(phaseTimer);
    phaseTimer = undefined;
  };

  const releaseHiddenNode = (node?: NodeSingular | null) => {
    const target = node ?? hiddenNode;
    if (!target || target.removed()) {
      if (!node || target === hiddenNode) hiddenNode = null;
      return;
    }

    target.removeClass("hover-hidden");
    if (!node || target === hiddenNode) {
      hiddenNode = null;
    }
  };

  const hideNode = (node: NodeSingular) => {
    if (hiddenNode && hiddenNode.id() !== node.id()) {
      releaseHiddenNode(hiddenNode);
    }
    hiddenNode = node;
    if (!node.removed()) {
      node.addClass("hover-hidden");
    }
  };

  const applyDriftTransform = () => {
    if (!cardEl) return;
    cardEl.style.transform =
      `scale(1.10) translate(${driftPose.x}px, ${driftPose.y}px) rotate(${driftPose.rotation}deg)`;
  };

  const pickNewTarget = () => {
    let nextTarget = driftTarget;
    do {
      nextTarget = {
        x: (Math.random() * 7) - 3.5,
        y: -8 + ((Math.random() * 5) - 2.5),
        rotation: (Math.random() * 1.4) - 0.7,
      };
    } while (Math.hypot(nextTarget.x - driftPose.x, nextTarget.y - driftPose.y) < 1.5);
    driftTarget = nextTarget;
  };

  const driftFrame = (now: number) => {
    if (!cardEl || card()?.token !== driftToken) {
      driftRafId = undefined;
      return;
    }

    // dt in seconds, capped at 50ms to prevent instability on tab-switch
    const dt = driftLastTime === 0 ? 0.016 : Math.min((now - driftLastTime) / 1000, 0.05);
    driftLastTime = now;

    // Critically damped spring: damping = 2 * sqrt(stiffness)
    // Response time ~2s for gentle organic drift
    const stiffness = 3;
    const damping = 3.5;
    const accelX = ((driftTarget.x - driftPose.x) * stiffness) - (driftVelocity.x * damping);
    const accelY = ((driftTarget.y - driftPose.y) * stiffness) - (driftVelocity.y * damping);
    const accelRotation =
      ((driftTarget.rotation - driftPose.rotation) * stiffness) - (driftVelocity.rotation * damping);

    driftVelocity.x += accelX * dt;
    driftVelocity.y += accelY * dt;
    driftVelocity.rotation += accelRotation * dt;

    driftPose.x += driftVelocity.x * dt;
    driftPose.y += driftVelocity.y * dt;
    driftPose.rotation += driftVelocity.rotation * dt;

    if (
      Math.hypot(driftTarget.x - driftPose.x, driftTarget.y - driftPose.y) < 0.5 &&
      Math.abs(driftTarget.rotation - driftPose.rotation) < 0.1
    ) {
      pickNewTarget();
    }

    applyDriftTransform();
    driftRafId = requestAnimationFrame(driftFrame);
  };

  const stopDrift = () => {
    if (driftRafId !== undefined) {
      cancelAnimationFrame(driftRafId);
      driftRafId = undefined;
    }
    driftLastTime = 0;
    return { ...driftPose };
  };

  const startDrift = (nextToken: number) => {
    stopDrift();
    driftToken = nextToken;
    driftPose = { x: 0, y: -8, rotation: 0 };
    driftVelocity = { x: 0, y: 0, rotation: 0 };
    driftTarget = { x: 0, y: -8, rotation: 0 };
    driftLastTime = 0;
    applyDriftTransform();
    pickNewTarget();
    driftRafId = requestAnimationFrame(driftFrame);
  };

  const syncPosition = (node = card()?.node) => {
    if (!node || node.removed()) {
      clearCard();
      return;
    }

    const nextGeometry = readNodeGeometry(node);
    const nextFontSize = readRenderedStyle(node, "font-size", "13px");
    setCard((current) => {
      if (!current || current.node.id() !== node.id()) return current;
      if (
        current.x === nextGeometry.x &&
        current.y === nextGeometry.y &&
        current.width === nextGeometry.width &&
        current.height === nextGeometry.height &&
        current.fontSize === nextFontSize
      ) {
        return current;
      }

      return {
        ...current,
        ...nextGeometry,
        fontSize: nextFontSize,
      };
    });
  };

  const clearCard = (expectedToken?: number) => {
    stopDrift();
    clearPhaseTimer();
    if (expectedToken !== undefined && card()?.token !== expectedToken) return;
    releaseHiddenNode();
    setCard(null);
    cardEl = null;
    bodyEl = null;
  };

  const beginSettle = (node: NodeSingular) => {
    const current = card();
    if (!current || current.node.id() !== node.id()) return;

    clearPhaseTimer();

    // If still grounded (lift hasn't painted yet), just clear immediately
    if (current.phase === "grounded") {
      clearCard(current.token);
      return;
    }

    if (!node.removed()) {
      node.addClass("hover-hidden");
    }

    const lastPose = stopDrift();
    if (cardEl) {
      cardEl.style.transform =
        `scale(1.10) translate(${lastPose.x}px, ${lastPose.y}px) rotate(${lastPose.rotation}deg)`;
    }
    if (bodyEl) {
      bodyEl.style.boxShadow = getComputedStyle(bodyEl).boxShadow;
    }
    if (cardEl) {
      cardEl.getBoundingClientRect();
      cardEl.style.transform = "scale(1) translate(0px, 0px) rotate(0deg)";
    }
    if (bodyEl) {
      bodyEl.style.boxShadow = "none";
    }

    setCard({
      ...current,
      phase: "settling",
    });

    const currentToken = current.token;
    phaseTimer = setTimeout(() => {
      clearCard(currentToken);
    }, SETTLE_DURATION_MS);
  };

  const beginHover = (node: NodeSingular) => {
    clearPhaseTimer();
    stopDrift();
    if (cardEl) {
      cardEl.style.transform = "";
    }
    if (bodyEl) {
      bodyEl.style.boxShadow = "";
    }
    const nextToken = ++token;
    const nodeClasses = node.classes();
    const visual = getNodeVisual(nodeClasses);
    const nodeType = visual && Array.isArray(nodeClasses)
      ? (nodeClasses.find((nodeClass) => nodeClass in nodeVisuals) || "")
      : "";
    const nextCard: HoverCard = {
      token: nextToken,
      node,
      label: readNodeLabel(node),
      nodeType,
      shape: readNodeStyle(node, "shape", "round-rectangle"),
      borderColor: readBorderColor(node),
      backgroundColor: readNodeStyle(node, "background-color", "#161b22"),
      textColor: readNodeStyle(node, "color", "#e6edf3"),
      fontSize: readRenderedStyle(node, "font-size", "13px"),
      ...readNodeGeometry(node),
      phase: "grounded",
    };

    setCard(nextCard);
    hideNode(node);

    // Double-rAF: browser paints grounded state, then we trigger the lift
    // transition. Without this the card appears already at the destination.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (card()?.token !== nextToken) return;

        setCard((prev) => {
          if (!prev || prev.token !== nextToken) return prev;
          return { ...prev, phase: "lifting" };
        });

        phaseTimer = setTimeout(() => {
          const current = card();
          if (!current || current.token !== nextToken || current.node.removed()) {
            clearCard(nextToken);
            return;
          }

          syncPosition(current.node);
          setCard((prev) => {
            if (!prev || prev.token !== nextToken) return prev;
            return { ...prev, phase: "floating" };
          });
          startDrift(nextToken);
        }, LIFT_DURATION_MS);
      });
    });
  };

  createEffect(() => {
    const cy = props.cy;
    const container = props.container;
    if (!cy || !container) return;

    const handleNodeMouseOver = (evt: EventObject) => {
      const node = evt.target as NodeSingular;
      if (typeof node.isParent === "function" && node.isParent()) return;
      beginHover(node);
    };

    const handleNodeMouseOut = (evt: EventObject) => {
      const node = evt.target as NodeSingular;
      if (typeof node.isParent === "function" && node.isParent()) return;
      beginSettle(node);
    };

    const reposition = () => {
      syncPosition();
    };

    // Force-clear overlay when pointer leaves canvas entirely
    const handleCanvasLeave = () => {
      clearCard();
    };

    cy.on("mouseover", "node", handleNodeMouseOver);
    cy.on("mouseout", "node", handleNodeMouseOut);
    cy.on("render", reposition);
    container.addEventListener("mouseleave", handleCanvasLeave);

    onCleanup(() => {
      cy.off("mouseover", "node", handleNodeMouseOver);
      cy.off("mouseout", "node", handleNodeMouseOut);
      cy.off("render", reposition);
      container.removeEventListener("mouseleave", handleCanvasLeave);
    });
  });

  onCleanup(() => {
    clearCard();
  });

  return (
    <div class="hover-overlay">
      <Show when={card()}>
        {(activeCard) => (
          <div
            class={`hover-card ${activeCard().phase}`}
            ref={(el) => {
              cardEl = el;
            }}
            style={{
              left: `${activeCard().x}px`,
              top: `${activeCard().y}px`,
              width: `${activeCard().width}px`,
              height: `${activeCard().height}px`,
            }}
          >
            <div
              class="hover-card-body"
              data-node-type={activeCard().nodeType}
              data-node-shape={activeCard().shape}
              ref={(el) => {
                bodyEl = el;
              }}
              style={{
                "border-color": activeCard().borderColor,
                "--glow-color": `${activeCard().borderColor}1a`,
                background: activeCard().backgroundColor,
                color: activeCard().textColor,
                "font-size": activeCard().fontSize,
                ...(activeCard().shape === "hexagon" ? {
                  "clip-path": "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
                  "border-radius": "0",
                } : activeCard().shape === "barrel" ? {
                  "border-radius": "12px / 50%",
                } : {}),
              }}
            >
              {(() => {
                const svg = getIconSvgByKind(activeCard().nodeType);
                return svg ? (
                  <span
                    class="hover-card-icon"
                    style={{
                      color: activeCard().borderColor,
                    }}
                    innerHTML={svg}
                  />
                ) : null;
              })()}
              <span class="hover-card-label">{activeCard().label}</span>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
