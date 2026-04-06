import { For, Show } from "solid-js";

import type { BehaviorPlaybackControllerType } from "./BehaviorPlayback";
import { PlaybackControls } from "./PlaybackControls";
import type { TransportStoreType } from "./TransportStore";

type ShadowboxChromeProps = {
  playback: BehaviorPlaybackControllerType;
  transport: TransportStoreType;
  onClose: () => void;
};

export function ShadowboxChrome(props: ShadowboxChromeProps) {
  const isActive = () => props.playback.status() !== "idle";
  const crumbs = () => props.playback.focusStack.breadcrumbs();

  return (
    <Show when={isActive()}>
      <div class="shadowbox-overlay is-active" />

      {/* Bridge overlay placeholder — visual bridge line renders here in future polish */}
      <Show when={props.playback.bridgeActive()}>
        <div class="shadowbox-bridge-active" />
      </Show>

      <div class="shadowbox-caption">
        {/* Breadcrumb trail for nested scenarios */}
        <Show when={crumbs().length > 0}>
          <div class="shadowbox-breadcrumb">
            <For each={crumbs()}>
              {(crumb, i) => (
                <>
                  {i() > 0 && <span class="shadowbox-breadcrumb-sep">{"\u203A"}</span>}
                  <span class="shadowbox-breadcrumb-item">{crumb.title}</span>
                </>
              )}
            </For>
          </div>
        </Show>

        <Show when={props.playback.scenario()}>
          <div class="shadowbox-caption-title">{props.playback.scenario()!.title}</div>
        </Show>
        <Show when={props.playback.captionText()}>
          <div class="shadowbox-caption-text">{props.playback.captionText()}</div>
        </Show>
        <Show when={props.playback.status() === "complete"}>
          <div class="shadowbox-caption-complete">Playback complete</div>
        </Show>
      </div>

      <div class="shadowbox-controls">
        <PlaybackControls transport={props.transport} />
        <button
          type="button"
          class="playback-btn shadowbox-close"
          onClick={props.onClose}
          title="Close"
        >
          {"\u2715"}
        </button>
      </div>
    </Show>
  );
}
