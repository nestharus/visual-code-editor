import { Show, Portal } from "solid-js/web";
import type { BehaviorPlaybackControllerType } from "./BehaviorPlayback";
import { PlaybackControls } from "./PlaybackControls";
import { ScenarioBox } from "./ScenarioBox";
import type { TransportStoreType } from "./TransportStore";

type ShadowboxModalProps = {
  playback: BehaviorPlaybackControllerType;
  transport: TransportStoreType;
  onClose: () => void;
};

export function ShadowboxModal(props: ShadowboxModalProps) {
  const isActive = () => props.playback.playbackTarget() === "modal";

  return (
    <Show when={isActive()}>
      <Portal>
        <div class="shadowbox-modal-backdrop" onClick={props.onClose} />
        <div class="shadowbox-modal-shell" onClick={(e) => e.stopPropagation()}>
          <Show when={props.playback.scenario()}>
            {(scenario) => (
              <ScenarioBox
                scenario={scenario()}
                currentBeatIndex={props.playback.currentBeatIndex()}
                width={700}
                height={400}
              />
            )}
          </Show>

          <div class="shadowbox-modal-caption">
            <Show when={props.playback.scenario()}>
              <div class="shadowbox-modal-caption-title">
                {props.playback.scenario()!.title}
              </div>
            </Show>
            <Show when={props.playback.captionText()}>
              <div class="shadowbox-modal-caption-text">
                {props.playback.captionText()}
              </div>
            </Show>
            <Show when={props.playback.status() === "complete"}>
              <div class="shadowbox-modal-caption-complete">
                Playback complete
              </div>
            </Show>
          </div>

          <div class="shadowbox-modal-controls">
            <PlaybackControls transport={props.transport} />
          </div>
        </div>
      </Portal>
    </Show>
  );
}
