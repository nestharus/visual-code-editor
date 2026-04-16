import {
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

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
  let inputRef: HTMLInputElement | undefined;
  const inputId = "diagram-search-input";

  const focusInput = () => {
    window.setTimeout(() => inputRef?.focus(), 0);
  };

  const openOverlay = (value = props.searchQuery || inputValue()) => {
    setInputValue(value);
    setIsOpen(true);
    focusInput();
  };

  const handleKeydown = (e: KeyboardEvent) => {
    const target = e.target;
    const isEditableTarget =
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      if (isEditableTarget) return;
      e.preventDefault();
      openOverlay();
      return;
    }

    if (e.key === "Escape" && (isOpen() || props.isSearchActive)) {
      e.preventDefault();
      if (props.isSearchActive) {
        props.onClear();
      }
      setInputValue("");
      setIsOpen(false);
    }
  };

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeydown);
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
    setInputValue("");
    props.onClear();
    setIsOpen(false);
  };

  return (
    <Show when={isOpen() || props.isSearchActive}>
      <div class="search-overlay">
        <form class="search-overlay-form" role="search" onSubmit={handleSubmit}>
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
