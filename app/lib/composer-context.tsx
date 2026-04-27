import {
  createContext,
  useContext,
  type Accessor,
} from "solid-js";

import type { AnchorKind, SelectionScope } from "./anchor";

export type ComposerOpenIntent = {
  surfaceAnchor: AnchorKind;
  selection?: SelectionScope;
  trigger?: HTMLElement;
  anchorRect?: DOMRectReadOnly;
};

export type ComposerOpenDirectIntent = {
  prompt: string;
  surfaceAnchor: AnchorKind;
  behaviourId?: string;
};

export type ComposerContextValue = {
  open: (intent: ComposerOpenIntent) => void;
  openDirect: (intent: ComposerOpenDirectIntent) => void;
  close: () => void;
  selection: Accessor<SelectionScope>;
};

export const ComposerContext = createContext<ComposerContextValue>();

export type DirectTaskDispatchBody = {
  label: string;
  prompt: string;
  related_behavior_ids: string[];
  request_id: string;
};

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `request:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function buildDirectTaskDispatchBody(submission: {
  prompt: string;
  selection: SelectionScope;
  requestId?: string;
}): DirectTaskDispatchBody {
  return {
    label: submission.prompt.slice(0, 80),
    prompt: submission.prompt,
    related_behavior_ids: submission.selection.items
      .filter((item) => item.kind === "behaviour-card")
      .map((item) => item.id),
    request_id: submission.requestId ?? makeRequestId(),
  };
}

export function useComposerContext(): ComposerContextValue {
  const context = useContext(ComposerContext);
  if (!context) {
    throw new Error("ComposerContext is only available inside AppShell.");
  }
  return context;
}
