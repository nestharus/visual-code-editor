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

export type ComposerContextValue = {
  open: (intent: ComposerOpenIntent) => void;
  close: () => void;
  selection: Accessor<SelectionScope>;
};

export const ComposerContext = createContext<ComposerContextValue>();

export function useComposerContext(): ComposerContextValue {
  const context = useContext(ComposerContext);
  if (!context) {
    throw new Error("ComposerContext is only available inside AppShell.");
  }
  return context;
}
