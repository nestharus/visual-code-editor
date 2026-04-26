import { For, Show, createMemo, createSignal, type JSX } from "solid-js";

import { PairedGraphViewport } from "../../lib/paired-viewport/PairedGraphViewport";
import type { DeltaKind, EntityDelta, PRDeltaSet } from "../../lib/pr-delta";
import type {
  ReviewThread,
  ReviewVerdict,
  ThreadStatus,
  VerdictDecision,
} from "../../lib/review-thread";

import "./pr-delta-panel.css";

export interface PRDeltaPanelProps {
  deltaSet: PRDeltaSet;
  onEntityClick: (delta: EntityDelta, side: "base" | "head") => void;
  showUnchanged?: boolean;
  threads?: readonly ReviewThread[];
  verdict?: ReviewVerdict | null;
  onCreateThread?: (
    delta: EntityDelta,
    side: "base" | "head",
    initialComment: string,
  ) => void;
  onAddComment?: (threadId: string, text: string) => void;
  onTransitionThread?: (threadId: string, toStatus: ThreadStatus) => void;
  onSubmitVerdict?: (decision: VerdictDecision, rationale: string) => void;
}

type PaneSide = "base" | "head";

interface PaneRow {
  delta: EntityDelta;
  label: string;
}

function deltaLabel(kind: DeltaKind): string {
  return kind;
}

function rowsForDelta(delta: EntityDelta, side: PaneSide, showUnchanged: boolean): PaneRow[] {
  switch (delta.deltaKind) {
    case "added":
      return side === "head" && delta.headId !== null ? [{ delta, label: delta.headId }] : [];
    case "removed":
      return side === "base" && delta.baseId !== null ? [{ delta, label: delta.baseId }] : [];
    case "renamed":
    case "reshaped":
      if (side === "base" && delta.baseId !== null) return [{ delta, label: delta.baseId }];
      if (side === "head" && delta.headId !== null) return [{ delta, label: delta.headId }];
      return [];
    case "unchanged":
      if (!showUnchanged) return [];
      if (side === "base" && delta.baseId !== null) return [{ delta, label: delta.baseId }];
      if (side === "head" && delta.headId !== null) return [{ delta, label: delta.headId }];
      return [];
    case "split":
      if (side === "base") {
        return delta.baseId !== null ? [{ delta, label: delta.baseId }] : [];
      }
      return [
        ...(delta.headId !== null ? [{ delta, label: delta.headId }] : []),
        ...delta.relatedIds.map((relatedId) => ({ delta, label: relatedId })),
      ];
    case "merged":
      if (side === "head") {
        return delta.headId !== null ? [{ delta, label: delta.headId }] : [];
      }
      return [
        ...(delta.baseId !== null ? [{ delta, label: delta.baseId }] : []),
        ...delta.relatedIds.map((relatedId) => ({ delta, label: relatedId })),
      ];
    case "unmatched":
      if (side === "base" && delta.baseId !== null) return [{ delta, label: delta.baseId }];
      if (side === "head" && delta.headId !== null) return [{ delta, label: delta.headId }];
      return [];
  }
}

function buildPaneRows(
  deltas: readonly EntityDelta[],
  side: PaneSide,
  showUnchanged: boolean,
): PaneRow[] {
  return deltas.flatMap((delta) => rowsForDelta(delta, side, showUnchanged));
}

function countDeltas(deltas: readonly EntityDelta[], kind: DeltaKind): number {
  return deltas.filter((delta) => delta.deltaKind === kind).length;
}

function rowKey(side: PaneSide, index: number): string {
  return `${side}:${index}`;
}

function verdictLabel(decision: VerdictDecision): string {
  switch (decision) {
    case "approved":
      return "approved";
    case "changes-requested":
      return "changes requested";
    case "rejected":
      return "rejected";
  }
}

function PaneList(props: {
  rows: readonly PaneRow[];
  side: PaneSide;
  onEntityClick: PRDeltaPanelProps["onEntityClick"];
  threads: readonly ReviewThread[];
  openThreadPanelKey: string | null;
  commentText: string;
  onToggleThreadPanel: (key: string) => void;
  onCommentTextInput: (value: string) => void;
  onAddComment?: PRDeltaPanelProps["onAddComment"];
  onTransitionThread?: PRDeltaPanelProps["onTransitionThread"];
}) {
  const handleRowClick = (row: PaneRow): JSX.EventHandler<HTMLButtonElement, MouseEvent> => {
    return (event) => {
      event.stopPropagation();
      props.onEntityClick(row.delta, props.side);
    };
  };

  const openThreadsForRow = (row: PaneRow) =>
    props.threads.filter(
      (thread) =>
        thread.status === "open" &&
        thread.anchorKind === row.delta.entityKind &&
        thread.anchorId === row.label &&
        thread.anchorSide === props.side,
    );

  const toggleThreadPanel = (
    event: MouseEvent | KeyboardEvent,
    key: string,
  ) => {
    event.stopPropagation();
    props.onToggleThreadPanel(key);
  };

  const submitComment = (threads: readonly ReviewThread[]) => {
    const text = props.commentText.trim();
    if (threads.length === 0 || text.length === 0) return;

    props.onAddComment?.(threads[0].id, text);
    props.onCommentTextInput("");
  };

  const transitionFirstThread = (
    threads: readonly ReviewThread[],
    toStatus: ThreadStatus,
  ) => {
    if (threads.length === 0) return;
    props.onTransitionThread?.(threads[0].id, toStatus);
  };

  return (
    <section
      class="pr-delta-panel__pane"
      data-testid={`pr-delta-pane-${props.side}`}
    >
      <ul class="pr-delta-panel__list" role="list">
        <For each={props.rows}>
          {(row, index) => {
            const key = () => rowKey(props.side, index());
            const openThreads = () => openThreadsForRow(row);
            const isPanelOpen = () => props.openThreadPanelKey === key();

            return (
              <li class="pr-delta-panel__list-item">
                <button
                  class="pr-delta-panel__row"
                  classList={{ "is-unchanged": row.delta.deltaKind === "unchanged" }}
                  data-testid={`pr-delta-row-${props.side}-${index()}`}
                  type="button"
                  role="button"
                  aria-label={`${deltaLabel(row.delta.deltaKind)} ${row.delta.entityKind} ${row.label}`}
                  onClick={handleRowClick(row)}
                >
                  <span
                    class={`pr-delta-panel__chip delta-chip delta-chip--${row.delta.deltaKind}`}
                    data-testid={`pr-delta-chip-${props.side}-${index()}`}
                  >
                    {row.delta.deltaKind}
                  </span>
                  <span class="pr-delta-panel__entity-label" title={row.label}>
                    {row.label}
                  </span>
                  <Show when={openThreads().length > 0}>
                    <span
                      class="pr-delta-panel__thread-indicator"
                      data-testid={`pr-delta-thread-indicator-${props.side}-${index()}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${openThreads().length} open review threads`}
                      onClick={(event) => toggleThreadPanel(event, key())}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleThreadPanel(event, key());
                        }
                      }}
                    >
                      💬 {openThreads().length}
                    </span>
                  </Show>
                  <span class="pr-delta-panel__entity-kind">{row.delta.entityKind}</span>
                </button>

                <Show when={isPanelOpen()}>
                  <div
                    class="pr-delta-panel__thread-panel"
                    data-testid={`pr-delta-thread-panel-${props.side}-${index()}`}
                  >
                    <ul class="pr-delta-panel__thread-comments" role="list">
                      <For each={openThreads()}>
                        {(thread) => (
                          <For each={thread.comments}>
                            {(comment) => (
                              <li class="pr-delta-panel__thread-comment">
                                <span class="pr-delta-panel__thread-actor">
                                  {comment.actor}
                                </span>
                                <span>{comment.text}</span>
                              </li>
                            )}
                          </For>
                        )}
                      </For>
                    </ul>
                    <textarea
                      class="pr-delta-panel__thread-input"
                      data-testid={`pr-delta-thread-comment-input-${props.side}-${index()}`}
                      value={props.commentText}
                      rows={2}
                      aria-label="Add review comment"
                      onInput={(event) => props.onCommentTextInput(event.currentTarget.value)}
                    />
                    <div class="pr-delta-panel__thread-actions">
                      <button
                        class="pr-delta-panel__secondary-button"
                        data-testid={`pr-delta-thread-add-comment-${props.side}-${index()}`}
                        type="button"
                        onClick={() => submitComment(openThreads())}
                      >
                        Add comment
                      </button>
                      <button
                        class="pr-delta-panel__secondary-button"
                        data-testid={`pr-delta-thread-resolve-${props.side}-${index()}`}
                        type="button"
                        onClick={() => transitionFirstThread(openThreads(), "resolved")}
                      >
                        Resolve
                      </button>
                      <button
                        class="pr-delta-panel__secondary-button"
                        data-testid={`pr-delta-thread-dismiss-${props.side}-${index()}`}
                        type="button"
                        onClick={() => transitionFirstThread(openThreads(), "dismissed")}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </Show>
              </li>
            );
          }}
        </For>
      </ul>
    </section>
  );
}

export function PRDeltaPanel(props: PRDeltaPanelProps) {
  const [showUnchanged, setShowUnchanged] = createSignal(props.showUnchanged ?? false);
  const [openThreadPanelKey, setOpenThreadPanelKey] = createSignal<string | null>(null);
  const [commentText, setCommentText] = createSignal("");
  const [draftVerdict, setDraftVerdict] = createSignal<VerdictDecision | null>(null);
  const [verdictRationale, setVerdictRationale] = createSignal("");

  const addedCount = createMemo(() => countDeltas(props.deltaSet.deltas, "added"));
  const removedCount = createMemo(() => countDeltas(props.deltaSet.deltas, "removed"));
  const reshapedCount = createMemo(() => countDeltas(props.deltaSet.deltas, "reshaped"));
  const baseRows = createMemo(() =>
    buildPaneRows(props.deltaSet.deltas, "base", showUnchanged()),
  );
  const headRows = createMemo(() =>
    buildPaneRows(props.deltaSet.deltas, "head", showUnchanged()),
  );

  const handleShowUnchanged: JSX.EventHandler<HTMLInputElement, Event> = (event) => {
    event.stopPropagation();
    setShowUnchanged(event.currentTarget.checked);
  };

  const handleToggleThreadPanel = (key: string) => {
    setOpenThreadPanelKey((current) => (current === key ? null : key));
    setCommentText("");
  };

  const openVerdictComposer = (decision: VerdictDecision) => {
    setDraftVerdict(decision);
    setVerdictRationale("");
  };

  const submitVerdict = () => {
    const decision = draftVerdict();
    const rationale = verdictRationale().trim();
    if (decision === null || rationale.length === 0) return;

    props.onSubmitVerdict?.(decision, rationale);
    setDraftVerdict(null);
    setVerdictRationale("");
  };

  return (
    <section
      class="pr-delta-panel"
      data-testid="pr-delta-panel"
      role="region"
      aria-label={`PR delta — ${props.deltaSet.baseBranch} to ${props.deltaSet.headBranch}`}
    >
      <div class="pr-delta-panel__verdict-bar" data-testid="pr-delta-verdict-bar">
        <div class="pr-delta-panel__verdict-status">
          <span>Verdict</span>
          <Show when={props.verdict !== null && props.verdict !== undefined}>
            <strong>{verdictLabel(props.verdict!.decision)}</strong>
          </Show>
        </div>
        <div class="pr-delta-panel__verdict-actions">
          <button type="button" onClick={() => openVerdictComposer("approved")}>
            Accept
          </button>
          <button type="button" onClick={() => openVerdictComposer("changes-requested")}>
            Request changes
          </button>
          <button type="button" onClick={() => openVerdictComposer("rejected")}>
            Reject
          </button>
        </div>
        <Show when={draftVerdict() !== null}>
          <div class="pr-delta-panel__verdict-composer">
            <textarea
              data-testid="pr-delta-verdict-rationale"
              rows={2}
              value={verdictRationale()}
              aria-label="Verdict rationale"
              onInput={(event) => setVerdictRationale(event.currentTarget.value)}
            />
            <button
              data-testid="pr-delta-verdict-submit"
              type="button"
              onClick={submitVerdict}
            >
              Submit
            </button>
          </div>
        </Show>
      </div>

      <header class="pr-delta-panel__header" data-testid="pr-delta-header">
        <div class="pr-delta-panel__header-main">
          <div class="pr-delta-panel__branches">
            <span class="pr-delta-panel__branch" title={props.deltaSet.baseBranch}>
              {props.deltaSet.baseBranch}
            </span>
            <span class="pr-delta-panel__arrow" aria-hidden="true">
              →
            </span>
            <span class="pr-delta-panel__branch" title={props.deltaSet.headBranch}>
              {props.deltaSet.headBranch}
            </span>
            <Show when={props.deltaSet.prNumber !== null}>
              <span class="pr-delta-panel__pr-badge">#{props.deltaSet.prNumber}</span>
            </Show>
          </div>
          <div
            class="pr-delta-panel__counts"
            data-testid="pr-delta-counts"
            role="status"
            aria-label={`${addedCount()} added, ${removedCount()} removed, ${reshapedCount()} reshaped`}
          >
            {addedCount()} + / {removedCount()} - / {reshapedCount()} ~
          </div>
        </div>

        <label class="pr-delta-panel__toggle">
          <input
            data-testid="pr-delta-show-unchanged"
            type="checkbox"
            checked={showUnchanged()}
            onChange={handleShowUnchanged}
            onClick={(event) => event.stopPropagation()}
          />
          <span>Show unchanged</span>
        </label>
      </header>

      <div class="pr-delta-panel__viewport">
        <PairedGraphViewport
          ariaLabel="PR delta entity panes"
          leftLabel="Base entities"
          rightLabel="Head entities"
          left={
            <PaneList
              rows={baseRows()}
              side="base"
              onEntityClick={props.onEntityClick}
              threads={props.threads ?? []}
              openThreadPanelKey={openThreadPanelKey()}
              commentText={commentText()}
              onToggleThreadPanel={handleToggleThreadPanel}
              onCommentTextInput={setCommentText}
              onAddComment={props.onAddComment}
              onTransitionThread={props.onTransitionThread}
            />
          }
          right={
            <PaneList
              rows={headRows()}
              side="head"
              onEntityClick={props.onEntityClick}
              threads={props.threads ?? []}
              openThreadPanelKey={openThreadPanelKey()}
              commentText={commentText()}
              onToggleThreadPanel={handleToggleThreadPanel}
              onCommentTextInput={setCommentText}
              onAddComment={props.onAddComment}
              onTransitionThread={props.onTransitionThread}
            />
          }
        />
      </div>
    </section>
  );
}
