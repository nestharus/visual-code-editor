import { ALL_GROUNDING_SOURCES, ALL_TRUST_STATES } from "../app/lib/trust";

console.log(
  JSON.stringify({
    trustStates: ALL_TRUST_STATES,
    groundingSources: ALL_GROUNDING_SOURCES,
  }),
);
