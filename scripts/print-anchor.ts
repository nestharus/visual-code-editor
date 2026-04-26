import {
  ALL_ANCHOR_KINDS,
  ALL_SELECTION_MODES,
  CONTAINER_ANCHOR_KINDS,
} from "../app/lib/anchor";

console.log(
  JSON.stringify({
    anchorKinds: ALL_ANCHOR_KINDS,
    selectionModes: ALL_SELECTION_MODES,
    containerAnchorKinds: [...CONTAINER_ANCHOR_KINDS].sort(),
  }),
);
