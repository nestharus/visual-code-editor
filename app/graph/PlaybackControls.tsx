import { ControlIcon } from "../components/ControlIcon";
import type { TransportStoreType } from "./TransportStore";

type PlaybackControlsProps = {
  transport: TransportStoreType;
};

export function PlaybackControls(props: PlaybackControlsProps) {
  const hasTokens = () => (props.transport.tokens as readonly { status: string }[]).length > 0;

  return (
    <div class="playback-controls">
      <button
        type="button"
        class="playback-btn"
        onClick={() => props.transport.playing() ? props.transport.pause() : props.transport.play()}
        disabled={!hasTokens()}
        title={props.transport.playing() ? "Pause" : "Play"}
        aria-label={props.transport.playing() ? "Pause" : "Play"}
      >
        <ControlIcon kind={props.transport.playing() ? "pause" : "play"} />
      </button>
      <button
        type="button"
        class="playback-btn"
        onClick={() => props.transport.step()}
        disabled={!hasTokens() || props.transport.playing()}
        title="Step"
        aria-label="Step"
      >
        <ControlIcon kind="step-forward" />
      </button>
      <button
        type="button"
        class="playback-btn"
        onClick={() => props.transport.reset()}
        disabled={!hasTokens()}
        title="Reset"
        aria-label="Reset"
      >
        <ControlIcon kind="stop" />
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
  );
}
