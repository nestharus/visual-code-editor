import {
  groundingSourceFromString,
  trustStateFromString,
  type TrustSignal,
} from "./trust";
import { RENDER_ID_PATTERN } from "./render-snapshot";
import { WIDGET_ID_PATTERN } from "./widget";

export type VariantAxisKind =
  | "prop"
  | "theme"
  | "locale"
  | "density"
  | "a11y-state"
  | "implied-state"
  | "viewport";

export type VariantCellState =
  | "grounded"
  | "candidate"
  | "missing"
  | "implied";

export interface VariantAxis {
  kind: VariantAxisKind;
  name: string;
  values: readonly string[];
}

export interface VariantCell {
  coordinates: Readonly<Record<string, string>>;
  state: VariantCellState;
  evidenceRenderIds: readonly string[];
  trust: TrustSignal;
}

export interface VariantTopology {
  id: string;
  widgetId: string;
  axes: readonly VariantAxis[];
  cells: readonly VariantCell[];
  computedAtMs: number;
}

export const VARIANT_TOPOLOGY_ID_PATTERN =
  /^variant-topology:[a-zA-Z0-9._-]+$/;

const VARIANT_AXIS_KINDS = [
  "prop",
  "theme",
  "locale",
  "density",
  "a11y-state",
  "implied-state",
  "viewport",
] as const satisfies readonly VariantAxisKind[];

const VARIANT_CELL_STATES = [
  "grounded",
  "candidate",
  "missing",
  "implied",
] as const satisfies readonly VariantCellState[];

const VARIANT_AXIS_KIND_SET: ReadonlySet<string> = new Set(VARIANT_AXIS_KINDS);
const VARIANT_CELL_STATE_SET: ReadonlySet<string> = new Set(VARIANT_CELL_STATES);

export function variantAxisKindFromString(value: string): VariantAxisKind {
  if (VARIANT_AXIS_KIND_SET.has(value)) {
    return value as VariantAxisKind;
  }

  throw new Error(`Unknown variant axis kind: ${value}`);
}

export function variantCellStateFromString(value: string): VariantCellState {
  if (VARIANT_CELL_STATE_SET.has(value)) {
    return value as VariantCellState;
  }

  throw new Error(`Unknown variant cell state: ${value}`);
}

function validateNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function validateTrustSignal(trust: TrustSignal): void {
  trustStateFromString(trust.state);
  if (trust.grounding !== null) {
    groundingSourceFromString(trust.grounding);
  }

  const hasGrounding = trust.grounding !== null;
  const isGrounded = trust.state === "grounded";

  if (isGrounded !== hasGrounding) {
    throw new Error("TrustSignal grounding must be set iff state is grounded");
  }
}

export function makeVariantAxis(partial: VariantAxis): VariantAxis {
  variantAxisKindFromString(partial.kind);
  validateNonEmptyString(partial.name, "VariantAxis name");

  if (partial.values.length === 0) {
    throw new Error("VariantAxis values must contain at least one value");
  }
  for (const value of partial.values) {
    if (typeof value !== "string") {
      throw new Error("VariantAxis values must contain strings");
    }
  }
  if (new Set(partial.values).size !== partial.values.length) {
    throw new Error("VariantAxis values must be deduped");
  }

  return {
    ...partial,
    values: Object.freeze([...partial.values]),
  };
}

export function makeVariantCell(partial: VariantCell): VariantCell {
  for (const [name, value] of Object.entries(partial.coordinates)) {
    if (typeof name !== "string" || typeof value !== "string") {
      throw new Error("VariantCell coordinates must map strings to strings");
    }
  }

  variantCellStateFromString(partial.state);
  for (const renderId of partial.evidenceRenderIds) {
    if (!RENDER_ID_PATTERN.test(renderId)) {
      throw new Error(
        "VariantCell evidenceRenderIds must match ^render:[a-zA-Z0-9._-]+$",
      );
    }
  }
  if (
    partial.state !== "grounded" &&
    partial.evidenceRenderIds.length !== 0
  ) {
    throw new Error(
      "VariantCell evidenceRenderIds may be non-empty only when state is grounded",
    );
  }

  validateTrustSignal(partial.trust);

  return {
    ...partial,
    coordinates: Object.freeze({ ...partial.coordinates }),
    evidenceRenderIds: Object.freeze([...partial.evidenceRenderIds]),
  };
}

export function makeVariantTopology(
  partial: VariantTopology,
): VariantTopology {
  if (!VARIANT_TOPOLOGY_ID_PATTERN.test(partial.id)) {
    throw new Error(
      "VariantTopology id must match ^variant-topology:[a-zA-Z0-9._-]+$",
    );
  }
  if (!WIDGET_ID_PATTERN.test(partial.widgetId)) {
    throw new Error(
      "VariantTopology widgetId must match ^widget:[a-zA-Z0-9._-]+$",
    );
  }
  if (partial.axes.length === 0) {
    throw new Error("VariantTopology axes must contain at least one axis");
  }

  const axes = partial.axes.map(makeVariantAxis);
  const cells = partial.cells.map(makeVariantCell);
  for (const cell of cells) {
    validateCellCoordinates(axes, cell);
  }

  if (partial.computedAtMs < 0) {
    throw new Error("VariantTopology computedAtMs must be >= 0");
  }

  return {
    ...partial,
    axes: Object.freeze(axes),
    cells: Object.freeze(cells),
  };
}

function validateCellCoordinates(
  axes: readonly VariantAxis[],
  cell: VariantCell,
): void {
  const axisNames = new Set(axes.map((axis) => axis.name));
  for (const axisName of axisNames) {
    if (!(axisName in cell.coordinates)) {
      throw new Error("VariantCell coordinates must cover every axis");
    }
  }

  for (const axis of axes) {
    if (!axis.values.includes(cell.coordinates[axis.name])) {
      throw new Error(
        "VariantCell coordinate values must exist on the matching axis",
      );
    }
  }
}
