import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/ActivityCapturing.md" with { type: "text" };
import { ActivityCapturingConcept, EmptySource, NoSuchCapture, InvalidDetails, NotCaptureOwner, NoSuchActivity } from "./Concept.ts";

export const activityCapturing = registerConcept({
  class: ActivityCapturingConcept,
  spec,
  refusals: {
    EMPTY_SOURCE: EmptySource,
    NO_SUCH_ACTIVITY: NoSuchActivity,
    NO_SUCH_CAPTURE: NoSuchCapture,
    INVALID_DETAILS: InvalidDetails,
    NOT_CAPTURE_OWNER: NotCaptureOwner,
  },
});
