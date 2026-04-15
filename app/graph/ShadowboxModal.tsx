import { Show, Portal } from "solid-js/web";
import type { BehaviorPlaybackControllerType } from "./BehaviorPlayback";
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
                transport={props.transport}
              />
            )}
          </Show>

          <div class="shadowbox-modal-caption">
            <Show when={props.playback.scenario()}>
              {(scenario) => (
                <div class="shadowbox-modal-caption-title">
                  {scenario().title}
                  <Show when={scenario().beats.length > 0}>
                    <span class="shadowbox-modal-step-count">
                      {" "}— {scenario().participants.length} participants, {scenario().beats.length} steps
                    </span>
                  </Show>
                </div>
              )}
            </Show>
            {/* Preamble: show scenario overview before playback starts */}
            <Show when={props.playback.scenario() && (props.playback.status() === "idle" || props.playback.status() === "loading")}>
              {(() => {
                const scenario = props.playback.scenario()!;
                return (
                  <div class="shadowbox-modal-preamble">
                    <Show when={scenario.caption}>
                      <div class="shadowbox-modal-preamble-desc">{scenario.caption}</div>
                    </Show>
                    <div class="shadowbox-modal-preamble-meta">
                      {scenario.participants.length} participants — {scenario.beats.length} steps
                    </div>
                    <div class="shadowbox-modal-preamble-hint">
                      Press play to begin
                    </div>
                  </div>
                );
              })()}
            </Show>
            {/* Progress during playback */}
            <Show when={props.playback.scenario() && props.playback.status() !== "idle" && props.playback.status() !== "loading"}>
              <div class="shadowbox-modal-progress">
                Step {props.playback.currentBeatIndex() + 1} of {props.playback.scenario()!.beats.length}
                <div class="shadowbox-modal-progress-bar">
                  <div
                    class="shadowbox-modal-progress-fill"
                    style={{
                      width: `${((props.playback.currentBeatIndex() + 1) / Math.max(props.playback.scenario()!.beats.length, 1)) * 100}%`,
                    }}
                  />
                </div>
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
            <div class="playback-controls">
              <button
                type="button"
                class="playback-btn"
                onClick={() => {
                  const status = props.playback.status();
                  if (status === "complete") {
                    // Restart from beginning
                    const scenarioId = props.playback.activeScenarioId();
                    const scenario = props.playback.scenario();
                    if (scenario) {
                      props.playback.start(scenario.behaviorId);
                    }
                  } else if (status === "paused") {
                    props.playback.resume();
                  } else if (status === "playing") {
                    props.playback.pause();
                  }
                }}
                title={props.playback.status() === "playing" ? "Pause" : props.playback.status() === "complete" ? "Replay" : "Play"}
              >
                {props.playback.status() === "playing" ? "\u23F8" : "\u25B6"}
              </button>
              <button
                type="button"
                class="playback-btn"
                onClick={() => props.transport.step()}
                disabled={props.playback.status() === "playing"}
                title="Step"
              >
                {"\u23ED"}
              </button>
              <select
                class="playback-speed"
                value={String(props.transport.speed())}
                onChange={(e) => props.transport.setSpeed(Number(e.currentTarget.value))}
              >
                <option value="0.25">0.25x</option>
                <option value="0.5">0.5x</option>
                <option value="1">1x</option>
                <option value="2">2x</option>
                <option value="4">4x</option>
              </select>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
