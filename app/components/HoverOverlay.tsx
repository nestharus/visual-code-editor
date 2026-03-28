import type { Core, EventObject, NodeSingular } from "cytoscape";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import "../styles/hover-overlay.css";

type HoverOverlayProps = {
  cy: Core | undefined;
  container: HTMLDivElement | undefined;
};

type HoverPhase = "lifting" | "floating" | "settling";

type HoverCard = {
  token: number;
  node: NodeSingular;
  label: string;
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

  const syncPosition = (node = card()?.node) => {
    if (!node || node.removed()) {
      setCard(null);
      releaseHiddenNode();
      return;
    }

    const nextGeometry = readNodeGeometry(node);
    setCard((current) => {
      if (!current || current.node.id() !== node.id()) return current;
      if (
        current.x === nextGeometry.x &&
        current.y === nextGeometry.y &&
        current.width === nextGeometry.width &&
        current.height === nextGeometry.height
      ) {
        return current;
      }

      return {
        ...current,
        ...nextGeometry,
      };
    });
  };

  const clearCard = (expectedToken?: number) => {
    clearPhaseTimer();
    if (expectedToken !== undefined && card()?.token !== expectedToken) return;
    releaseHiddenNode();
    setCard(null);
  };

  const beginSettle = (node: NodeSingular) => {
    const current = card();
    if (!current || current.node.id() !== node.id()) return;

    clearPhaseTimer();
    if (!node.removed()) {
      node.addClass("hover-hidden");
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
    const nextToken = ++token;
    const nextCard: HoverCard = {
      token: nextToken,
      node,
      label: readNodeLabel(node),
      borderColor: readBorderColor(node),
      backgroundColor: readNodeStyle(node, "background-color", "#161b22"),
      textColor: readNodeStyle(node, "color", "#e6edf3"),
      fontSize: readNodeStyle(node, "font-size", "13px"),
      ...readNodeGeometry(node),
      phase: "lifting",
    };

    setCard(nextCard);
    hideNode(node);

    phaseTimer = setTimeout(() => {
      const current = card();
      if (!current || current.token !== nextToken || current.node.removed()) {
        clearCard(nextToken);
        return;
      }

      syncPosition(current.node);
      setCard((prev) => {
        if (!prev || prev.token !== nextToken) return prev;
        return {
          ...prev,
          phase: "floating",
        };
      });
    }, LIFT_DURATION_MS);
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
      const current = card();
      if (current) {
        clearPhaseTimer();
        releaseHiddenNode();
        setCard(null);
      }
    };

    cy.on("mouseover", "node", handleNodeMouseOver);
    cy.on("mouseout", "node", handleNodeMouseOut);
    cy.on("mouseout", handleCanvasLeave);
    cy.on("render", reposition);
    container.addEventListener("mouseleave", handleCanvasLeave);

    onCleanup(() => {
      cy.off("mouseover", "node", handleNodeMouseOver);
      cy.off("mouseout", "node", handleNodeMouseOut);
      cy.off("mouseout", handleCanvasLeave);
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
            style={{
              left: `${activeCard().x}px`,
              top: `${activeCard().y}px`,
              width: `${activeCard().width}px`,
              height: `${activeCard().height}px`,
            }}
          >
            <div
              class="hover-card-body"
              style={{
                "border-color": activeCard().borderColor,
                background: activeCard().backgroundColor,
                color: activeCard().textColor,
                "font-size": activeCard().fontSize,
              }}
            >
              {activeCard().label}
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
