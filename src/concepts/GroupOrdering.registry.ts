import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/GroupOrdering.md" with { type: "text" };
import { GroupOrderingConcept, InvalidOrder } from "./GroupOrdering.ts";
export const groupOrdering = registerConcept({ class: GroupOrderingConcept, spec, refusals: { INVALID_ORDER: InvalidOrder } });
