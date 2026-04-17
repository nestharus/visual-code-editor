export type OverlayEntry = {
  id: symbol;
  onEscape: () => void;
  modal?: boolean;
};

export type ShortcutEntry = {
  id: symbol;
  keyMatcher: (e: KeyboardEvent) => boolean;
  handler: (e: KeyboardEvent) => void;
  guard?: () => boolean;
};

let overlays: OverlayEntry[] = [];
let shortcuts: ShortcutEntry[] = [];
let listenerInstalled = false;

function syncListener() {
  if (typeof document === "undefined") return;

  const shouldListen = overlays.length + shortcuts.length > 0;
  if (shouldListen === listenerInstalled) return;

  if (shouldListen) {
    document.addEventListener("keydown", handleDocumentKeydown);
  } else {
    document.removeEventListener("keydown", handleDocumentKeydown);
  }

  listenerInstalled = shouldListen;
}

function handleDocumentKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented) return;

  if (e.key === "Escape") {
    const topOverlay = overlays[overlays.length - 1];
    if (!topOverlay) return;

    e.preventDefault();
    e.stopPropagation();
    topOverlay.onEscape();
    return;
  }

  for (const shortcut of shortcuts) {
    if (shortcut.guard && !shortcut.guard()) continue;
    if (!shortcut.keyMatcher(e)) continue;
    shortcut.handler(e);
    return;
  }
}

function removeOverlay(id: symbol) {
  overlays = overlays.filter((entry) => entry.id !== id);
  syncListener();
}

function removeShortcut(id: symbol) {
  shortcuts = shortcuts.filter((entry) => entry.id !== id);
  syncListener();
}

export function pushOverlay(entry: OverlayEntry): () => void {
  removeOverlay(entry.id);
  overlays = [...overlays, entry];
  syncListener();

  return () => {
    removeOverlay(entry.id);
  };
}

export function isTopOverlay(id: symbol): boolean {
  return overlays[overlays.length - 1]?.id === id;
}

export function hasModalOpen(): boolean {
  return overlays.some((entry) => entry.modal);
}

export function registerShortcut(entry: ShortcutEntry): () => void {
  removeShortcut(entry.id);
  shortcuts = [...shortcuts, entry];
  syncListener();

  return () => {
    removeShortcut(entry.id);
  };
}
