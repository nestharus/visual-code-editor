import { createSignal } from "solid-js";

export type BehaviourCardEditorBanner =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

const IDLE_BANNER: BehaviourCardEditorBanner = { kind: "idle" };

export function createBehaviourCardEditorState() {
  const [initialTexts, setInitialTexts] = createSignal<readonly string[]>([]);
  const [draftTexts, setDraftTexts] = createSignal<readonly string[]>([]);
  const [banner, setBanner] = createSignal<BehaviourCardEditorBanner>(IDLE_BANNER);

  const reset = () => {
    setInitialTexts([]);
    setDraftTexts([]);
    setBanner(IDLE_BANNER);
  };

  const replaceTexts = (texts: readonly string[]) => {
    const nextTexts = [...texts];
    setInitialTexts(nextTexts);
    setDraftTexts(nextTexts);
  };

  const updateDraftText = (index: number, text: string) => {
    setDraftTexts((current) => {
      const next = [...current];
      next[index] = text;
      return next;
    });
  };

  return {
    initialTexts,
    draftTexts,
    banner,
    setBanner,
    reset,
    replaceTexts,
    updateDraftText,
  };
}
