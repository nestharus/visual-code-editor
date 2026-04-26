import { expect, test } from "@playwright/test";

import {
  ALL_GROUNDING_SOURCES,
  ALL_TRUST_STATES,
  groundingSourceFromString,
  makeTrustSignal,
  trustStateFromString,
  type GroundingSource,
  type TrustState,
} from "./trust";

const CONTRACT_TRUST_STATES = [
  ["GROUNDED", "grounded"],
  ["CANDIDATE", "candidate"],
  ["CONFLICTING", "conflicting"],
  ["STALE", "stale"],
  ["ORPHANED", "orphaned"],
] as const satisfies readonly (readonly [string, TrustState])[];

const CONTRACT_GROUNDING_SOURCES = [
  ["TEST", "test"],
  ["LSP_TYPE", "lsp-type"],
  ["RUNTIME_TRACE", "runtime-trace"],
  ["ANNOTATION", "annotation"],
  ["USER_CONFIRMED", "user-confirmed"],
  ["PROVIDER_VERIFIED", "provider-verified"],
] as const satisfies readonly (readonly [string, GroundingSource])[];

const CONTRACT_TRUST_VALUES = CONTRACT_TRUST_STATES.map(([, state]) => state);
const CONTRACT_GROUNDING_VALUES = CONTRACT_GROUNDING_SOURCES.map(([, source]) => source);
const UNGROUNDED_STATES = CONTRACT_TRUST_VALUES.filter((state) => state !== "grounded");
const FORBIDDEN_VOCABULARY = [
  "pending",
  "unsynced",
  "degraded",
  "partial",
  "local",
  "ok",
  "error",
] as const;

const describe = test.describe;
const it = test;

describe("Trust vocabulary contract", () => {
  for (const [memberName, stateValue] of CONTRACT_TRUST_STATES) {
    it(`contains contract trust state ${memberName} with stable string value ${stateValue}`, () => {
      expect(ALL_TRUST_STATES).toContain(stateValue);
      expect(trustStateFromString(stateValue)).toBe(stateValue);
    });
  }

  for (const [memberName, sourceValue] of CONTRACT_GROUNDING_SOURCES) {
    it(`contains contract grounding source ${memberName} with stable string value ${sourceValue}`, () => {
      expect(ALL_GROUNDING_SOURCES).toContain(sourceValue);
      expect(groundingSourceFromString(sourceValue)).toBe(sourceValue);
    });
  }

  it("keeps ALL_TRUST_STATES in contract declaration order", () => {
    expect(ALL_TRUST_STATES).toEqual(CONTRACT_TRUST_VALUES);
  });

  it("keeps ALL_GROUNDING_SOURCES in contract declaration order", () => {
    expect(ALL_GROUNDING_SOURCES).toEqual(CONTRACT_GROUNDING_VALUES);
  });

  it("contains exactly the 5 contract trust states", () => {
    expect(ALL_TRUST_STATES).toHaveLength(5);
    expect(new Set(ALL_TRUST_STATES)).toEqual(new Set(CONTRACT_TRUST_VALUES));
  });

  it("contains exactly the 6 contract grounding sources", () => {
    expect(ALL_GROUNDING_SOURCES).toHaveLength(6);
    expect(new Set(ALL_GROUNDING_SOURCES)).toEqual(new Set(CONTRACT_GROUNDING_VALUES));
  });

  it("throws instead of silently accepting unknown trust state strings", () => {
    for (const invalidValue of ["", "expired", "inferred", "GROUNDED", "grounded "]) {
      expect(
        () => trustStateFromString(invalidValue),
        `trustStateFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown grounding source strings", () => {
    for (const invalidValue of ["", "expired", "inferred", "TEST", "runtime_trace"]) {
      expect(
        () => groundingSourceFromString(invalidValue),
        `groundingSourceFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("requires a grounding source when the trust state is grounded", () => {
    expect(() => makeTrustSignal("grounded", null)).toThrow();
  });

  for (const [, sourceValue] of CONTRACT_GROUNDING_SOURCES) {
    it(`accepts grounded trust signal with grounding source ${sourceValue}`, () => {
      expect(makeTrustSignal("grounded", sourceValue)).toEqual({
        state: "grounded",
        grounding: sourceValue,
      });
    });
  }

  for (const stateValue of UNGROUNDED_STATES) {
    it(`accepts ${stateValue} trust signal with no grounding source`, () => {
      expect(makeTrustSignal(stateValue, null)).toEqual({
        state: stateValue,
        grounding: null,
      });
    });
  }

  for (const stateValue of UNGROUNDED_STATES) {
    for (const [, sourceValue] of CONTRACT_GROUNDING_SOURCES) {
      it(`rejects ${stateValue} trust signal with grounding source ${sourceValue}`, () => {
        expect(() => makeTrustSignal(stateValue, sourceValue)).toThrow();
      });
    }
  }

  it("does not admit forbidden adjacent vocabulary as trust states", () => {
    for (const forbiddenValue of FORBIDDEN_VOCABULARY) {
      expect(
        () => trustStateFromString(forbiddenValue),
        `No vocabulary leakage invariant violated for TrustState ${forbiddenValue}`,
      ).toThrow();
    }
  });

  it("does not admit forbidden adjacent vocabulary as grounding sources", () => {
    for (const forbiddenValue of FORBIDDEN_VOCABULARY) {
      expect(
        () => groundingSourceFromString(forbiddenValue),
        `No vocabulary leakage invariant violated for GroundingSource ${forbiddenValue}`,
      ).toThrow();
    }
  });
});
