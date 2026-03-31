import { Show, createMemo, createSignal } from "solid-js";
import { IconSvg } from "./IconSvg";

const childLabelByKind: Record<string, string> = {
  cluster: "systems",
  lifecycle: "stages",
  stage: "steps",
  system: "items",
};

export function ParentSummary(props: {
  parentKind: string;
  parentId: string;
  parentLabel: string;
  parentDescription?: string;
  childCount?: number;
  onExpand: () => void;
}) {
  const [collapsed, setCollapsed] = createSignal(false);
  const childSummary = createMemo(() => {
    if (typeof props.childCount !== "number") return "";
    const suffix = childLabelByKind[props.parentKind] || "children";
    return `${props.childCount} ${suffix}`;
  });

  return (
    <Show when={!collapsed()}>
      <div class="parent-summary" style={{ "pointer-events": "auto" }}>
        <div class="parent-summary-icon">
          <IconSvg kind={props.parentKind} size={20} />
        </div>
        <div class="parent-summary-info">
          <div class="parent-summary-meta">
            <span class="parent-summary-kind">{props.parentKind}</span>
            <Show when={childSummary()}>
              <span class="parent-summary-count">{childSummary()}</span>
            </Show>
          </div>
          <strong>{props.parentLabel}</strong>
          <Show when={props.parentDescription}>
            <p class="parent-summary-desc">{props.parentDescription}</p>
          </Show>
        </div>
        <button
          type="button"
          class="button"
          onClick={props.onExpand}
          title={`View ${props.parentKind} details`}
          aria-label={`View ${props.parentKind} details`}
        >
          ℹ
        </button>
        <button
          type="button"
          class="button"
          onClick={() => setCollapsed(true)}
          title="Dismiss summary"
          aria-label="Dismiss summary"
        >
          ✕
        </button>
      </div>
    </Show>
  );
}
