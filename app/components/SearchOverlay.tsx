import {
  Show,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";

import { createOverlayFocus } from "../lib/a11y/createOverlayFocus";
import * as overlayStack from "../lib/a11y/overlayStack";

type SearchOverlayProps = {
  onSearch: (query: string) => void;
  onClear: () => void;
  isSearchActive: boolean;
  searchQuery: string;
  isLoading: boolean;
  resultCount: number;
  openRequest?: number;
};

export function SearchOverlay(props: SearchOverlayProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [inputValue, setInputValue] = createSignal(props.searchQuery);
  let formRef: HTMLFormElement | undefined;
  let inputRef: HTMLInputElement | undefined;
  const inputId = "diagram-search-input";
  const shortcutId = Symbol("search-shortcut");
  const isVisible = () => isOpen() || props.isSearchActive;

  const isEditableElement = (target: Element | null) => {
    return (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    );
  };

  const openOverlay = (value = props.searchQuery || inputValue()) => {
    const wasVisible = isVisible();
    const activeElement =
      document.activeElement instanceof Element ? document.activeElement : null;
    if (!wasVisible && !isEditableElement(activeElement)) {
      const trigger = document.querySelector('[data-toolbar="search"]');
      if (trigger instanceof HTMLElement) {
        trigger.focus();
      }
    }
    setInputValue(value);
    setIsOpen(true);
    if (wasVisible) {
      queueMicrotask(() => inputRef?.focus());
    }
  };

  const closeOverlay = () => {
    const wasSearchActive = props.isSearchActive;
    setInputValue("");
    setIsOpen(false);
    if (wasSearchActive) {
      props.onClear();
    }
  };

  const unregisterShortcut = overlayStack.registerShortcut({
    id: shortcutId,
    keyMatcher: (e) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f",
    guard: () => !overlayStack.hasModalOpen(),
    handler: (e) => {
      const activeElement =
        document.activeElement instanceof Element ? document.activeElement : null;
      if (isEditableElement(activeElement)) return;
      e.preventDefault();
      openOverlay();
    },
  });

  onCleanup(() => {
    unregisterShortcut();
  });

  createOverlayFocus({
    isOpen: isVisible,
    getRoot: () => formRef,
    getFocusTarget: () => inputRef ?? null,
    onEscape: closeOverlay,
  });

  createEffect((previousOpenRequest?: number) => {
    const nextOpenRequest = props.openRequest;
    if (
      nextOpenRequest !== undefined &&
      previousOpenRequest !== undefined &&
      nextOpenRequest !== previousOpenRequest
    ) {
      openOverlay();
    }
    return nextOpenRequest;
  });

  createEffect((previousQuery?: string) => {
    const nextQuery = props.searchQuery;
    if (nextQuery !== previousQuery) {
      setInputValue(nextQuery);
    }
    return nextQuery;
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const query = inputValue().trim();
    if (query) {
      props.onSearch(query);
    }
  };

  const handleClear = () => {
    closeOverlay();
  };

  return (
    <Show when={isVisible()}>
      <div class="search-overlay">
        <form
          ref={formRef}
          class="search-overlay-form"
          role="search"
          onSubmit={handleSubmit}
        >
          <label class="visually-hidden" for={inputId}>
            Search diagram elements
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            class="search-overlay-input"
            placeholder="Search diagram elements..."
            value={inputValue()}
            onInput={(e) => setInputValue(e.currentTarget.value)}
            autofocus
          />
          <Show when={props.isLoading || props.isSearchActive}>
            <span
              classList={{
                "search-overlay-status": true,
                "search-overlay-spinner": props.isLoading,
                "search-overlay-count": props.isSearchActive && !props.isLoading,
              }}
              aria-live="polite"
            >
              {props.isLoading ? "Searching..." : `${props.resultCount} results`}
            </span>
          </Show>
          <button type="submit" class="search-overlay-btn">
            Search
          </button>
          <Show when={props.isSearchActive}>
            <button
              type="button"
              class="search-overlay-btn search-overlay-clear"
              onClick={handleClear}
            >
              Clear
            </button>
          </Show>
        </form>
      </div>
    </Show>
  );
}
