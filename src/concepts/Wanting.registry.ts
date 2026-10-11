import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/Wanting.md" with { type: "text" };
import { WantingConcept, AlreadyWanted, NotWanted } from "./Wanting.ts";

export const wanting = registerConcept({
  class: WantingConcept,
  spec,
  refusals: {
    ALREADY_WANTED: AlreadyWanted,
    NOT_WANTED: NotWanted,
  },
});
