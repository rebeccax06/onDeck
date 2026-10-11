import type { OnDeckWireHttp } from "../generated/wire.ts";

/** Generated endpoint shapes plus errors supplied by the authenticated HTTP host. */
type HostError = { error: "UNAUTHORIZED" | "INVALID_REQUEST" | "INTERNAL_ERROR" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE" };
export type OnDeckHttpContract = {
  [Path in keyof OnDeckWireHttp]: Omit<OnDeckWireHttp[Path], "error"> & {
    error: OnDeckWireHttp[Path]["error"] | HostError |
      (Path extends "/groups/invite" ? { error: "INVALID_EMAIL" | "FRIEND_NOT_FOUND" } : never);
  };
};
