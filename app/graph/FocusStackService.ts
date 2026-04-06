import { createSignal, type Accessor } from "solid-js";

export type FocusFrame = {
  scenarioId: string;
  title: string;
  parentScenarioId: string | null;
  parentBeatIndex: number;
  resumeBeatIndex: number;
  entryNodeId: string;
  exitNodeId?: string;
};

const MAX_DEPTH = 8;

export function createFocusStackService() {
  const [stack, setStack] = createSignal<FocusFrame[]>([]);

  function current(): FocusFrame | null {
    const s = stack();
    return s.length > 0 ? s[s.length - 1] : null;
  }

  function depth(): number {
    return stack().length;
  }

  function pushChild(frame: FocusFrame): boolean {
    if (depth() >= MAX_DEPTH) return false;
    setStack((prev) => [...prev, frame]);
    return true;
  }

  function pop(): FocusFrame | null {
    const s = stack();
    if (s.length === 0) return null;
    const popped = s[s.length - 1];
    setStack((prev) => prev.slice(0, -1));
    return popped;
  }

  function clear() {
    setStack([]);
  }

  const breadcrumbs: Accessor<Array<{ scenarioId: string; title: string }>> = () =>
    stack().map((frame) => ({ scenarioId: frame.scenarioId, title: frame.title }));

  return { stack, current, depth, pushChild, pop, clear, breadcrumbs };
}

export type FocusStackServiceType = ReturnType<typeof createFocusStackService>;
