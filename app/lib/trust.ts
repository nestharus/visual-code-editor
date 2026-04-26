/**
 * Canonical trust vocabulary for derived workspace values.
 *
 * New trust states and grounding sources must be added through proposal cycles,
 * not ad hoc.
 */

export const ALL_TRUST_STATES = [
  "grounded",
  "candidate",
  "conflicting",
  "stale",
  "orphaned",
] as const;

export type TrustState = (typeof ALL_TRUST_STATES)[number];

export const ALL_GROUNDING_SOURCES = [
  "test",
  "lsp-type",
  "runtime-trace",
  "annotation",
  "user-confirmed",
  "provider-verified",
] as const;

export type GroundingSource = (typeof ALL_GROUNDING_SOURCES)[number];

export interface TrustSignal {
  state: TrustState;
  grounding: GroundingSource | null;
}

const TRUST_STATE_SET: ReadonlySet<string> = new Set(ALL_TRUST_STATES);
const GROUNDING_SOURCE_SET: ReadonlySet<string> = new Set(ALL_GROUNDING_SOURCES);

export function trustStateFromString(value: string): TrustState {
  if (TRUST_STATE_SET.has(value)) {
    return value as TrustState;
  }

  throw new Error(`Unknown trust state: ${value}`);
}

export function groundingSourceFromString(value: string): GroundingSource {
  if (GROUNDING_SOURCE_SET.has(value)) {
    return value as GroundingSource;
  }

  throw new Error(`Unknown grounding source: ${value}`);
}

export function makeTrustSignal(
  state: TrustState,
  grounding: GroundingSource | null,
): TrustSignal {
  const hasGrounding = grounding !== null;
  const isGrounded = state === "grounded";

  if (isGrounded !== hasGrounding) {
    throw new Error("TrustSignal grounding must be set iff state is grounded");
  }

  return { state, grounding };
}
