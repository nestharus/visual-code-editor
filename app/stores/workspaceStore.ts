import { Store } from "@tanstack/solid-store";

export type WorkspaceState = {
  buildId: string | null;
  sourceRoot: string | null;
  sourceHash: string | null;
  loading: boolean;
};

export const workspaceStore = new Store<WorkspaceState>({
  buildId: null,
  sourceRoot: null,
  sourceHash: null,
  loading: false,
});
