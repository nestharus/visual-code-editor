export type WidgetKind =
  | "button"
  | "input"
  | "list"
  | "modal"
  | "tab"
  | "panel"
  | "card"
  | "tooltip"
  | "banner"
  | "chip"
  | "form"
  | "table"
  | "avatar"
  | "icon"
  | "generic";

export type WidgetSurface =
  | "source"
  | "storybook"
  | "figma"
  | "design-token"
  | "runtime";

export interface WidgetReference {
  surface: WidgetSurface;
  identifier: string;
  evidenceSource: string;
}

export interface Widget {
  id: string;
  label: string;
  kind: WidgetKind;
  references: readonly WidgetReference[];
  trust: {
    state: "grounded" | "candidate" | "conflicting" | "stale" | "orphaned";
    grounding:
      | "test"
      | "lsp-type"
      | "runtime-trace"
      | "annotation"
      | "user-confirmed"
      | "provider-verified"
      | null;
  };
  attributionActor: string;
  createdAtMs: number;
}

export interface WidgetExtractionResult {
  widgets: readonly Widget[];
  computed_at_ms: number;
}

export type WidgetExtractionErrorKind = "extraction" | "internal";

export class WidgetExtractionError extends Error {
  readonly errorKind: WidgetExtractionErrorKind;

  constructor(
    errorKind: WidgetExtractionErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WidgetExtractionError";
    this.errorKind = errorKind;
  }
}
