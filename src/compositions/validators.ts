import type { EndpointValidator } from "@mit-sdg/sync-engine/boundary";

/** Validate primitive shapes before a request is recorded. Domain constraints stay in concepts. */
export function inputValidator(required: string[], optional: string[] = []): EndpointValidator {
  return (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, detail: "Expected an object." };
    const value = input as Record<string, unknown>;
    const keys = new Set([...required, ...optional]);
    if (Object.keys(value).some((key) => !keys.has(key))) return { ok: false, detail: "Unknown input field." };
    for (const key of required) {
      if (key === "participants") {
        if (!Array.isArray(value[key]) || value[key].some((user) => typeof user !== "string" || user.length === 0)) return { ok: false, detail: "participants must be an array of user IDs." };
      } else if (typeof value[key] !== "string" || (key === "user" && value[key] === "")) return { ok: false, detail: `${key} must be a string.` };
    }
    for (const key of optional) {
      if (value[key] != null && typeof value[key] !== (["cost", "maxCost"].includes(key) ? "number" : "string")) return { ok: false, detail: `${key} has the wrong type.` };
    }
    return { ok: true };
  };
}
