import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/Experiencing.md" with { type: "text" };
import { ExperiencingConcept, AlreadyCompleted, InvalidPreference, NotCompleted } from "./Experiencing.ts";

export const experiencing = registerConcept({
  class: ExperiencingConcept,
  spec,
  refusals: {
    ALREADY_COMPLETED: AlreadyCompleted,
    INVALID_PREFERENCE: InvalidPreference,
    NOT_COMPLETED: NotCompleted,
  },
});
