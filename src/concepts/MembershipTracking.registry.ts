import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/MembershipTracking.md" with { type: "text" };
import { MembershipTrackingConcept, InvalidName, NoSuchGroup, NotAMember, AlreadyAMember, AlreadyInvited, NoSuchInvitation, NotInvited } from "./MembershipTracking.ts";

export const membershipTracking = registerConcept({
  class: MembershipTrackingConcept,
  spec,
  refusals: {
    INVALID_NAME: InvalidName,
    NO_SUCH_GROUP: NoSuchGroup,
    NOT_A_MEMBER: NotAMember,
    ALREADY_A_MEMBER: AlreadyAMember,
    ALREADY_INVITED: AlreadyInvited,
    NO_SUCH_INVITATION: NoSuchInvitation,
    NOT_INVITED: NotInvited,
  },
});
