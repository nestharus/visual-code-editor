export type DiagramElementData = Record<string, unknown> & {
  id?: string;
  source?: string;
  target?: string;
  label?: string;
  kind?: string;
  parent?: string;
};

export type DiagramElementDefinition = {
  data?: DiagramElementData;
  classes?: string;
  position?: {
    x: number;
    y: number;
  };
};
