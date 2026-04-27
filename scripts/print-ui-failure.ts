import {
  ALL_UI_FAILURE_KINDS,
  ALL_UI_FAILURE_SEVERITIES,
} from "../app/lib/ui-failure";

console.log(
  JSON.stringify({
    uiFailureKinds: ALL_UI_FAILURE_KINDS,
    uiFailureSeverities: ALL_UI_FAILURE_SEVERITIES,
  }),
);
