import { useLocation } from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { WATCHER_URL } from "../lib/diagram-data";

type PanelPromptCodeBlock = {
  id: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  language?: string;
  symbol?: string;
  content?: string;
};

type PanelPromptScenario = {
  behaviorId: string;
  title: string;
};

type PanelPromptProps = {
  entityId: string;
  entityKind: string;
  entityLabel: string;
  description: string;
  codeBlocks: PanelPromptCodeBlock[];
  scenarios: PanelPromptScenario[];
  focusedBlockId: string | null;
  onClearFocus: () => void;
  accent: string;
};

type PromptMode = "ask" | "edit";

type PanelPromptAnswer = {
  kind: "answer";
  response: string;
};

type PanelPromptEdit = {
  blockId: string;
  path: string;
  before: string;
  after: string;
  language?: string;
  symbol?: string;
};

type PanelPromptCodeEdit = {
  kind: "code-edit";
  response: string;
  edits: PanelPromptEdit[];
};

type PanelPromptResponse = PanelPromptAnswer | PanelPromptCodeEdit;

export function PanelPrompt(props: PanelPromptProps) {
  const location = useLocation();
  const [mode, setMode] = createSignal<PromptMode>("ask");
  const [prompt, setPrompt] = createSignal("");
  const [result, setResult] = createSignal<PanelPromptResponse | null>(null);
  const [error, setError] = createSignal("");
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  let requestVersion = 0;
  const inputId = () => `panel-prompt-input-${props.entityId}`;

  const focusedBlock = createMemo(
    () => props.codeBlocks.find((block) => block.id === props.focusedBlockId) ?? null,
  );

  const answerResult = createMemo<PanelPromptAnswer | null>(() => {
    const value = result();
    return value?.kind === "answer" ? value : null;
  });

  const editResult = createMemo<PanelPromptCodeEdit | null>(() => {
    const value = result();
    return value?.kind === "code-edit" ? value : null;
  });

  createEffect(() => {
    props.entityId;
    requestVersion += 1;
    setMode("ask");
    setPrompt("");
    setResult(null);
    setError("");
    setIsSubmitting(false);
  });

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    const nextPrompt = prompt().trim();
    if (!nextPrompt || isSubmitting()) return;

    const currentRequestVersion = ++requestVersion;
    setIsSubmitting(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`${WATCHER_URL}/api/panel-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pathname: location().pathname,
          prompt: nextPrompt,
          mode: mode(),
          panel: {
            kind: props.entityKind,
            id: props.entityId,
            label: props.entityLabel,
          },
          focus: {
            blockIds: props.focusedBlockId ? [props.focusedBlockId] : [],
          },
          context: {
            entity: {
              id: props.entityId,
              kind: props.entityKind,
              label: props.entityLabel,
              description: props.description,
            },
            codeBlocks: props.codeBlocks,
            scenarios: props.scenarios,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Panel prompt request failed");
      }

      const data = await response.json();
      if (currentRequestVersion !== requestVersion) return;

      if (data?.kind === "answer" && typeof data.response === "string") {
        setResult({
          kind: "answer",
          response: data.response,
        });
        return;
      }

      if (
        data?.kind === "code-edit" &&
        typeof data.response === "string" &&
        Array.isArray(data.edits)
      ) {
        setResult({
          kind: "code-edit",
          response: data.response,
          edits: data.edits.map((edit: Record<string, unknown>) => ({
            blockId: typeof edit.blockId === "string" ? edit.blockId : "",
            path: typeof edit.path === "string" ? edit.path : "",
            before: typeof edit.before === "string" ? edit.before : "",
            after: typeof edit.after === "string" ? edit.after : "",
            language: typeof edit.language === "string" ? edit.language : undefined,
            symbol: typeof edit.symbol === "string" ? edit.symbol : undefined,
          })),
        });
        return;
      }

      throw new Error("Panel prompt response missing required data");
    } catch (submissionError) {
      if (currentRequestVersion !== requestVersion) return;
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "Panel prompt request failed";
      setError(message);
      setResult(null);
    } finally {
      if (currentRequestVersion === requestVersion) {
        setIsSubmitting(false);
      }
    }
  };

  const focusLabel = createMemo(() => {
    const block = focusedBlock();
    if (!block) return "";
    const identity = block.symbol ? `${block.symbol} · ${block.path}` : block.path;
    return `${identity} (L${block.lineStart}-${block.lineEnd})`;
  });

  return (
    <section
      class="detail-prompt"
      style={{ "--accent": props.accent || "#58a6ff" } as JSX.CSSProperties}
      aria-label="Panel prompt"
    >
      <div class="detail-prompt-header">
        <h3 class="detail-prompt-title">Panel Prompt</h3>
        <span class="detail-prompt-badge">Fixture-backed</span>
      </div>

      <div class="detail-prompt-mode" role="tablist" aria-label="Prompt mode">
        <button
          type="button"
          classList={{
            "detail-prompt-mode-btn": true,
            "is-active": mode() === "ask",
          }}
          onClick={() => {
            setMode("ask");
            setResult(null);
            setError("");
          }}
        >
          Ask
        </button>
        <button
          type="button"
          classList={{
            "detail-prompt-mode-btn": true,
            "is-active": mode() === "edit",
          }}
          onClick={() => {
            setMode("edit");
            setResult(null);
            setError("");
          }}
        >
          Edit
        </button>
      </div>

      <Show when={focusedBlock()}>
        <div class="detail-prompt-focus">
          <span>{focusLabel()}</span>
          <button
            type="button"
            class="detail-prompt-focus-clear"
            onClick={props.onClearFocus}
            aria-label="Clear focused code block"
          >
            Clear
          </button>
        </div>
      </Show>

      <form onSubmit={handleSubmit}>
        <label class="visually-hidden" for={inputId()}>
          {mode() === "ask" ? "Ask about this entity or its code" : "Request a focused code edit suggestion"}
        </label>
        <textarea
          id={inputId()}
          class="detail-prompt-input"
          placeholder={
            mode() === "ask"
              ? "Ask about this entity or its code..."
              : "Request a focused code edit suggestion..."
          }
          value={prompt()}
          onInput={(event) => setPrompt(event.currentTarget.value)}
        />
        <div class="detail-prompt-actions">
          <button
            type="submit"
            class="button detail-prompt-submit"
            disabled={isSubmitting() || prompt().trim().length === 0}
          >
            {isSubmitting() ? "Submitting..." : mode() === "ask" ? "Ask" : "Suggest Edit"}
          </button>
        </div>
      </form>

      <Show when={error()}>
        <p class="detail-prompt-error" role="alert">
          {error()}
        </p>
      </Show>

      <Show when={answerResult()}>
        {(answer) => (
          <div class="detail-prompt-result" aria-live="polite">
            <p class="detail-prompt-result-label">Response</p>
            <p class="detail-prompt-answer">{answer().response}</p>
          </div>
        )}
      </Show>

      <Show when={editResult()}>
        {(editResponse) => (
          <div class="detail-prompt-result" aria-live="polite">
            <p class="detail-prompt-result-label">Response</p>
            <p class="detail-prompt-answer">{editResponse().response}</p>
            <For each={editResponse().edits}>
              {(edit) => (
                <>
                  <Show when={edit.symbol || edit.path}>
                    <p class="detail-prompt-result-label">
                      {edit.symbol ? `${edit.symbol} · ${edit.path}` : edit.path}
                    </p>
                  </Show>
                  <div class="detail-prompt-edit-block">
                    <div class="detail-prompt-edit-label is-before">Before</div>
                    <pre class="detail-prompt-edit-code"><code>{edit.before}</code></pre>
                  </div>
                  <div class="detail-prompt-edit-block">
                    <div class="detail-prompt-edit-label is-after">After</div>
                    <pre class="detail-prompt-edit-code"><code>{edit.after}</code></pre>
                  </div>
                </>
              )}
            </For>
          </div>
        )}
      </Show>
    </section>
  );
}
