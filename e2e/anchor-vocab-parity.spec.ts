import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import {
  ALL_ANCHOR_KINDS,
  ALL_SELECTION_MODES,
  CONTAINER_ANCHOR_KINDS,
} from "../app/lib/anchor";

const SERVER_VOCAB_PATH = resolve("server/anchor-vocab.ts");

// There is no existing server-side test harness in this repo, so the B.3
// server/app vocabulary parity check lives in e2e.
test("server anchor vocabulary stays in sync with app/lib/anchor.ts", async () => {
  expect(
    existsSync(SERVER_VOCAB_PATH),
    "server/anchor-vocab.ts should exist for watcher validation",
  ).toBe(true);

  const serverVocab = await import(pathToFileURL(SERVER_VOCAB_PATH).href);

  expect(serverVocab.ALL_ANCHOR_KINDS).toEqual(ALL_ANCHOR_KINDS);
  expect(serverVocab.ALL_SELECTION_MODES).toEqual(ALL_SELECTION_MODES);
  expect(serverVocab.CONTAINER_ANCHOR_KINDS).toEqual(CONTAINER_ANCHOR_KINDS);
});
