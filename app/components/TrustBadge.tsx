import type { GroundingSource, TrustState } from "../lib/trust";

type TrustBadgeProps = {
  state: TrustState;
  grounding?: GroundingSource | null;
  size?: "sm" | "md";
};

export function TrustBadge(props: TrustBadgeProps) {
  const size = () => props.size ?? "sm";
  const title = () =>
    props.grounding ? `Trust: ${props.state} (${props.grounding})` : `Trust: ${props.state}`;

  return (
    <span
      class={`trust-badge trust-badge--${props.state} trust-badge--${size()}`}
      data-testid="trust-badge"
      data-trust-state={props.state}
      role="img"
      aria-label={`Trust: ${props.state}`}
      title={title()}
    >
      <span class="trust-badge__mark" aria-hidden="true" />
    </span>
  );
}
