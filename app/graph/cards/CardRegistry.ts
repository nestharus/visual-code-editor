import type { Component, JSX } from "solid-js";

import type { GraphNode } from "../layout/types";
import { CompoundCard } from "./CompoundCard";
import { DefaultCard } from "./DefaultCard";

export type GraphZoomTier = "dot" | "icon" | "label" | "full";

export type GraphCardProps = {
  node: GraphNode;
  zoomTier: GraphZoomTier;
  children?: JSX.Element;
};

const cardRegistry: Record<string, Component<GraphCardProps>> = {
  "module-group": CompoundCard,
};

export function getCardComponent(kind: string): Component<GraphCardProps> {
  return cardRegistry[kind] ?? DefaultCard;
}

export { DefaultCard };
