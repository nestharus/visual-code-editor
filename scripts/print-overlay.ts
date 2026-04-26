import {
  makeOperationalOverlay,
  overlayProviderIdFromString,
  overlaySignalKindFromString,
  type OperationalOverlay,
} from "../app/lib/overlay";

const overlayProviderIds = [
  "g:test",
  "g:pr-delta",
  "g:deploy",
  "g:profile",
  "g:task-active",
].map(overlayProviderIdFromString);

const overlaySignalKinds = [
  "pass",
  "fail",
  "in-progress",
  "stale",
  "info",
].map(overlaySignalKindFromString);

const scenarios: readonly {
  name: string;
  input: OperationalOverlay;
}[] = [
  {
    name: "complete overlay snapshot",
    input: {
      layers: [
        {
          providerId: "g:test",
          signals: [
            {
              providerId: "g:test",
              entityId: "behavior:auth.login",
              kind: "fail",
              label: "1 failing test",
              trust: {
                state: "grounded",
                grounding: "runtime-trace",
              },
              emittedAtMs: 1_700_000_000_000,
              detailUrl: "https://ci.example.test/runs/123",
            },
            {
              providerId: "g:test",
              entityId: "behavior:checkout.submit",
              kind: "pass",
              label: "12 tests passing",
              trust: {
                state: "grounded",
                grounding: "runtime-trace",
              },
              emittedAtMs: 1_700_000_000_001,
              detailUrl: null,
            },
          ],
          computedAtMs: 1_700_000_000_500,
          attributionActor: "ci",
        },
        {
          providerId: "g:pr-delta",
          signals: [
            {
              providerId: "g:pr-delta",
              entityId: "behavior:auth.login",
              kind: "info",
              label: "Changed in PR",
              trust: { state: "candidate", grounding: null },
              emittedAtMs: 1_700_000_000_100,
              detailUrl: "https://github.example.test/pull/42",
            },
          ],
          computedAtMs: 1_700_000_000_600,
          attributionActor: "generator",
        },
        {
          providerId: "g:deploy",
          signals: [
            {
              providerId: "g:deploy",
              entityId: "system:api",
              kind: "in-progress",
              label: "Deploying to staging",
              trust: { state: "candidate", grounding: null },
              emittedAtMs: 1_700_000_000_200,
              detailUrl: null,
            },
          ],
          computedAtMs: 1_700_000_000_700,
          attributionActor: "generator",
        },
        {
          providerId: "g:profile",
          signals: [
            {
              providerId: "g:profile",
              entityId: "module:billing.worker",
              kind: "stale",
              label: "Profile stale",
              trust: { state: "stale", grounding: null },
              emittedAtMs: 1_700_000_000_300,
              detailUrl: null,
            },
          ],
          computedAtMs: 1_700_000_000_800,
          attributionActor: "generator",
        },
        {
          providerId: "g:task-active",
          signals: [
            {
              providerId: "g:task-active",
              entityId: "task:auth-flow",
              kind: "info",
              label: "Active task",
              trust: { state: "grounded", grounding: "annotation" },
              emittedAtMs: 1_700_000_000_400,
              detailUrl: null,
            },
          ],
          computedAtMs: 1_700_000_000_900,
          attributionActor: "agents:direct",
        },
      ],
      computedAtMs: 1_700_000_001_000,
    },
  },
];

console.log(
  JSON.stringify({
    overlayProviderIds,
    overlaySignalKinds,
    overlays: scenarios.map((scenario) => ({
      name: scenario.name,
      overlay: makeOperationalOverlay(scenario.input),
    })),
  }),
);
