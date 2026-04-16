import { For, Show, createEffect, createSignal } from "solid-js";

import type { PromptSelectionItem } from "../graph/GraphSurface";

type PromptDockProps = {
  isOpen: boolean;
  selection: PromptSelectionItem[];
  onToggleSelection: (nodeId: string) => void;
  onClearSelection: () => void;
  onSubmit: (prompt: string) => Promise<string>;
  onClose?: () => void;
};

export function PromptDock(props: PromptDockProps) {
  const [prompt, setPrompt] = createSignal("");
  const [response, setResponse] = createSignal("");
  const [error, setError] = createSignal("");
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const titleId = "prompt-dock-title";
  const inputId = "prompt-dock-input";

  createEffect(() => {
    if (!props.isOpen) {
      setPrompt("");
      setResponse("");
      setError("");
      setIsSubmitting(false);
    }
  });

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    const nextPrompt = prompt().trim();
    if (!nextPrompt || isSubmitting()) return;

    setIsSubmitting(true);
    setError("");

    try {
      const nextResponse = await props.onSubmit(nextPrompt);
      setResponse(nextResponse);
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "Prompt request failed";
      setError(message);
      setResponse("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Show when={props.isOpen && props.selection.length > 0}>
      <section
        class="prompt-dock"
        role="complementary"
        aria-labelledby={titleId}
      >
        <div class="prompt-dock-header">
          <div class="prompt-dock-title">
            <span class="eyebrow">Prompt Selected Entities</span>
            <h2 id={titleId}>
              {props.selection.length} selected
              {" "}
              {props.selection.length === 1 ? "entity" : "entities"}
            </h2>
          </div>
          <div class="prompt-dock-actions">
            <Show when={props.onClose}>
              <button
                type="button"
                class="button prompt-dock-close"
                onClick={() => props.onClose?.()}
              >
                Hide
              </button>
            </Show>
            <button
              type="button"
              class="button prompt-dock-clear"
              onClick={props.onClearSelection}
            >
              Clear selection
            </button>
          </div>
        </div>

        <div class="prompt-dock-chips">
          <For each={props.selection}>
            {(item) => (
              <button
                type="button"
                class="prompt-dock-chip"
                title={`Deselect ${item.label}`}
                onClick={() => props.onToggleSelection(item.id)}
              >
                <span>{item.label}</span>
                <span aria-hidden="true">x</span>
              </button>
            )}
          </For>
        </div>

        <form class="prompt-dock-form" onSubmit={handleSubmit}>
          <label class="visually-hidden" for={inputId}>
            Ask about the selected entities
          </label>
          <textarea
            id={inputId}
            class="prompt-dock-input"
            rows={4}
            placeholder="Ask about the selected entities..."
            value={prompt()}
            onInput={(event) => setPrompt(event.currentTarget.value)}
          />
          <div class="prompt-dock-controls">
            <p class="prompt-dock-helper">
              Cmd/Ctrl+click cards to add or remove them. Up to 10 entities.
            </p>
            <button
              type="submit"
              class="button prompt-dock-submit"
              disabled={isSubmitting() || prompt().trim().length === 0}
            >
              {isSubmitting() ? "Submitting..." : "Submit prompt"}
            </button>
          </div>
        </form>

        <Show when={error()}>
          <p class="prompt-dock-error" role="alert">
            {error()}
          </p>
        </Show>

        <Show when={response()}>
          <div class="prompt-dock-thread" aria-live="polite">
            <div class="prompt-dock-response-label">Mock response</div>
            <pre class="prompt-dock-response">{response()}</pre>
          </div>
        </Show>
      </section>
    </Show>
  );
}
