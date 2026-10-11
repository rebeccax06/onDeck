import type { Db } from "mongodb";
import { ActivityCapturingConcept } from "./concepts/Concept.ts";
import { MembershipTrackingConcept } from "./concepts/MembershipTracking.ts";
import { SuggestingConcept } from "./concepts/Suggesting.ts";
import { WantingConcept } from "./concepts/Wanting.ts";
import { ExperiencingConcept } from "./concepts/Experiencing.ts";

export function createInstances(db: Db) {
  return {
    ActivityCapturing: new ActivityCapturingConcept(db),
    MembershipTracking: new MembershipTrackingConcept(db),
    Suggesting: new SuggestingConcept(db),
    Wanting: new WantingConcept(db),
    Experiencing: new ExperiencingConcept(db),
  };
}
