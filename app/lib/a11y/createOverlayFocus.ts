import { createEffect, onCleanup } from "solid-js";

import * as overlayStack from "./overlayStack";

const TABBABLE_SELECTOR = "a[href], button:not([disabled]), input:not([disabled]):not([type=\"hidden\"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex=\"-1\"]), summary";

export type CreateOverlayFocusOptions = {
  isOpen: () => boolean;
  getRoot: () => HTMLElement | undefined;
  getFocusTarget?: () => HTMLElement | null;
  trapFocus?: boolean;
  usePortalTiming?: boolean;
  onEscape: () => void;
};

function isFocusable(el: HTMLElement | null): boolean {
  if (!el || !el.isConnected) return false;
  if (el.closest("[hidden]")) return false;
  if (el.getClientRects().length === 0) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  return true;
}

function getTabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    isFocusable,
  );
}

export function createOverlayFocus(options: CreateOverlayFocusOptions): void {
  const id = Symbol("overlay-focus");
  let opener: HTMLElement | null = null;
  let unregisterOverlay: (() => void) | undefined;
  let removeTrapListener: (() => void) | undefined;
  let focusRequest = 0;
  let frameId: number | undefined;

  const cancelScheduledFocus = () => {
    focusRequest += 1;
    if (frameId !== undefined) {
      cancelAnimationFrame(frameId);
      frameId = undefined;
    }
  };

  const removeTrap = () => {
    removeTrapListener?.();
    removeTrapListener = undefined;
  };

  const removeOverlay = () => {
    unregisterOverlay?.();
    unregisterOverlay = undefined;
  };

  const restoreFocus = () => {
    const fallback = document.querySelector("#diagram-viewport");
    if (isFocusable(opener)) {
      opener.focus();
    } else if (fallback instanceof HTMLElement) {
      fallback.focus();
    }
    opener = null;
  };

  const focusWithinOverlay = () => {
    const root = options.getRoot();
    if (!root) return;

    const requestedTarget = options.getFocusTarget?.() ?? null;
    const target =
      (isFocusable(requestedTarget) ? requestedTarget : null) ??
      getTabbables(root)[0] ??
      (isFocusable(root) ? root : null);

    target?.focus();
  };

  const handleTrapKeydown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.key !== "Tab" || !overlayStack.isTopOverlay(id)) {
      return;
    }

    const root = options.getRoot();
    if (!root) return;

    const tabbables = getTabbables(root);
    const fallbackTarget = isFocusable(root) ? root : null;
    const orderedTargets = tabbables.length > 0
      ? tabbables
      : fallbackTarget
        ? [fallbackTarget]
        : [];

    if (orderedTargets.length === 0) return;

    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!activeElement || !root.contains(activeElement)) {
      e.preventDefault();
      orderedTargets[e.shiftKey ? orderedTargets.length - 1 : 0]?.focus();
      return;
    }

    const currentIndex = orderedTargets.indexOf(activeElement);
    if (currentIndex === -1) {
      e.preventDefault();
      orderedTargets[e.shiftKey ? orderedTargets.length - 1 : 0]?.focus();
      return;
    }

    e.preventDefault();
    const nextIndex =
      (currentIndex + (e.shiftKey ? -1 : 1) + orderedTargets.length) %
      orderedTargets.length;
    orderedTargets[nextIndex]?.focus();
  };

  const installTrap = () => {
    if (!options.trapFocus || removeTrapListener || typeof document === "undefined") {
      return;
    }

    document.addEventListener("keydown", handleTrapKeydown);
    removeTrapListener = () => {
      document.removeEventListener("keydown", handleTrapKeydown);
    };
  };

  const scheduleFocus = () => {
    const requestId = ++focusRequest;
    const applyFocus = () => {
      if (frameId !== undefined) {
        frameId = undefined;
      }
      if (requestId !== focusRequest || !options.isOpen()) return;
      focusWithinOverlay();
    };

    if (options.usePortalTiming) {
      frameId = requestAnimationFrame(applyFocus);
    } else {
      queueMicrotask(applyFocus);
    }
  };

  createEffect((wasOpen = false) => {
    const isOpen = options.isOpen();

    if (isOpen && !wasOpen) {
      opener =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      unregisterOverlay = overlayStack.pushOverlay({
        id,
        onEscape: options.onEscape,
        modal: options.usePortalTiming,
      });
      installTrap();
      scheduleFocus();
    } else if (!isOpen && wasOpen) {
      cancelScheduledFocus();
      removeTrap();
      removeOverlay();
      restoreFocus();
    }

    return isOpen;
  });

  onCleanup(() => {
    cancelScheduledFocus();
    removeTrap();
    removeOverlay();
    opener = null;
  });
}
