import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/Suggesting.md" with { type: "text" };
import { SuggestingConcept, AlreadySuggested, NoSuchSuggestion, NotSuggester } from "./Suggesting.ts";

export const suggesting = registerConcept({
  class: SuggestingConcept,
  spec,
  refusals: {
    ALREADY_SUGGESTED: AlreadySuggested,
    NO_SUCH_SUGGESTION: NoSuchSuggestion,
    NOT_SUGGESTER: NotSuggester,
  },
});
