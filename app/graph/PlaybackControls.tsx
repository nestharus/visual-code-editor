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
      >
        {props.transport.playing() ? "\u23F8" : "\u25B6"}
      </button>
      <button
        type="button"
        class="playback-btn"
        onClick={() => props.transport.step()}
        disabled={!hasTokens() || props.transport.playing()}
        title="Step"
      >
        {"\u23ED"}
      </button>
      <button
        type="button"
        class="playback-btn"
        onClick={() => props.transport.reset()}
        disabled={!hasTokens()}
        title="Reset"
      >
        {"\u23F9"}
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
