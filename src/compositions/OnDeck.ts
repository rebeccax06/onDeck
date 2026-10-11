import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { compute, each, form, former, is, reaction, view, when, where } from "@mit-sdg/sync-engine/language";
import type { createApplicationConceptSet } from "../concepts.ts";
import { inputValidator } from "./validators.ts";

const errors = ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP",
  "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"];
const detailsOptional = ["source", "description", "location", "category", "cost", "currency", "dateTime"];
const filterKeys = ["category", "location", "maxCost", "currency", "from", "until"];
function options(required: string[], optional: string[] = []) {
  return { input: { required, defaults: Object.fromEntries(optional.map((key) => [key, null])) },
    validators: { input: inputValidator(required, optional) } };
}

/** receive → concept action → respond pattern. */
export function createComposition(set: ReturnType<typeof createApplicationConceptSet>) {
  const { MembershipTracking, ActivityCapturing, Suggesting, Wanting, Experiencing } = set.concepts;
  const calculations = set.computations;
  const MemberMayAccessGroup = view("(user) may access (group)", ({ user, group }, _outputs, _bindings) =>
    where(MembershipTracking._membership({ user, group }).is({ member: true })),
  ).holds();
  const MemberMayAccessActivity = view("(user) may access (activity) in (group)", ({ user, group, activity }, _outputs, _bindings) =>
    where(MemberMayAccessGroup({ user, group }), Suggesting._contains({ group, item: activity }).is({ suggested: true })),
  ).holds();
  const ValidParticipants = view("valid (participants) and (filters) in (group)", ({ group, participants, filters }, _outputs, { error }) =>
    where(compute(calculations.participantError, { group, participants, filters }, error), is.among(error, [null])),
  ).holds();

  const GroupList = former("groups for (user)", ({ user }, { group, name }) => form({
    groups: each(MembershipTracking._groups({ user }).is({ group, name })).form({ group, name }),
  }));
  const GroupPage = former("the group page (group)", ({ group }, { name, user }) =>
    where(MembershipTracking._get({ group }).is({ name })).form({ group, name,
      members: each(MembershipTracking._members({ group }).is({ user })).form({ user }),
    }),
  );
  const InvitationInbox = former("invitations for (user)", ({ user }, { invitation, group, inviter, name }) => form({
    invitations: each(MembershipTracking._invitations({ invitee: user }).is({ invitation, group, inviter }))
      .where(MembershipTracking._get({ group }).is({ name })).form({ invitation, group, inviter, name }),
  }));
  const CapturePreview = former("capture preview (capture)", ({ capture }, { preview }) =>
    where(compute(calculations.capturePreview, { capture }, preview)).form({ capture: preview }),
  );
  const GroupCollection = former("collection for (group)", ({ group }, { activities }) =>
    where(compute(calculations.groupCollection, { group }, activities)).form({ activities }),
  );
  const ActivityPage = former("activity page (activity) in (group)", ({ group, activity }, { page }) =>
    where(compute(calculations.activityPage, { group, activity }, page)).form({ activity: page }),
  );
  const PickOptions = former("options for (participants) in (group) with (filters)", ({ group, participants, filters }, { result }) =>
    where(compute(calculations.pickOptions, { group, participants, filters }, result)).form({ result }),
  );

  const SuggestionCreatesWant = reaction(({ user, item }) =>
    when(Suggesting.suggest({ user, item }).responds({}))
      .where(Wanting._wants({ user, item }).is({ wanted: false }))
      .then(Wanting.want({ user, item })),
  );
  const CompletionClearsWant = reaction(({ user, item }) =>
    when(Experiencing.complete({ user, item }).responds({}))
      .where(Wanting._wants({ user, item }).is({ wanted: true }))
      .then(Wanting.unwant({ user, item })),
  );
  const RepeatYesCreatesWant = reaction(({ user, item }) =>
    when(Experiencing.setRepeatPreference({ user, item, preference: "YES" }).responds({}))
      .where(Wanting._wants({ user, item }).is({ wanted: false }))
      .then(Wanting.want({ user, item })),
  );
  const RepeatNoClearsWant = reaction(({ user, item }) =>
    when(Experiencing.setRepeatPreference({ user, item, preference: "NO" }).responds({}))
      .where(Wanting._wants({ user, item }).is({ wanted: true }))
      .then(Wanting.unwant({ user, item })),
  );
  const CaptureStartedProposesDetails = reaction(({ capture, source, name, proposedSource, description, location, category, cost, currency, dateTime }) =>
    when(ActivityCapturing.start({ source }).responds({ capture }))
      .where(compute(calculations.extractDetails, { source }, { name, proposedSource, description, location, category, cost, currency, dateTime }),
      is.gt(name, ""), ActivityCapturing._capture({ capture }))
      .then(ActivityCapturing.propose({ capture, name, source: proposedSource, description, location, category, cost, currency, dateTime })),
  );

  const ListGroups = endpoint("/groups/list", ({ user }) =>
    receive({ user })
      .then(respond({ book: GroupList({ user }) })),
    options(["user"], []),
  );

  const CreateGroup = endpoint("/groups/create", ({ user, name, group }) =>
    receive({ user, name })
      .then(MembershipTracking.create({ creator: user, name }).responds({ group }))
      .then(respond({ group })),
    options(["user", "name"], []),
  );

  const ListInvitations = endpoint("/invitations/list", ({ user }) =>
    receive({ user })
      .then(respond({ inbox: InvitationInbox({ user }) })),
    options(["user"], []),
  );

  const AcceptInvitation = endpoint("/invitations/accept", ({ user, invitation, group }) =>
    receive({ user, invitation })
      .then(MembershipTracking.accept({ invitee: user, invitation }).responds({ group }))
      .then(respond({ group })),
    options(["user", "invitation"], []),
  );

  const DeclineInvitation = endpoint("/invitations/decline", ({ user, invitation }) =>
    receive({ user, invitation })
      .then(MembershipTracking.decline({ invitee: user, invitation }).responds({}))
      .then(respond({ success: true })),
    options(["user", "invitation"], []),
  );

  const StartCapture = endpoint("/captures/start", ({ user, source, capture }) =>
    receive({ user, source })
      .then(ActivityCapturing.start({ user, source }).responds({ capture }))
      .then(respond({ capture })),
    options(["user", "source"], []),
  );

  const ConfirmCapture = endpoint("/captures/confirm", ({ user, capture, name, source, description, location, category, cost, currency, dateTime, activity }) =>
    receive({ user, capture, name, source, description, location, category, cost, currency, dateTime })
      .then(ActivityCapturing.confirm({ user, capture, name, source, description, location, category, cost, currency, dateTime }).responds({ activity }))
      .then(respond({ activity })),
    options(["user", "capture", "name"], ["source", "description", "location", "category", "cost", "currency", "dateTime"]),
  );

  const DiscardCapture = endpoint("/captures/discard", ({ user, capture }) =>
    receive({ user, capture })
      .then(ActivityCapturing.discard({ user, capture }).responds({}))
      .then(respond({ success: true })),
    options(["user", "capture"], []),
  );

  const GetGroup = endpoint("/groups/get", ({ user, group, error }) =>
    receive({ user, group })
      .where(compute(calculations.groupAccessError, { user, group }, error))
      .then(
        where(is.among(error, [null]), MemberMayAccessGroup({ user, group }))
          .then(respond({ page: GroupPage({ group }) })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "group"]),
  );

  const Invite = endpoint("/groups/invite", ({ user, group, invitee, error, invitation }) =>
    receive({ user, group, invitee })
      .where(compute(calculations.groupAccessError, { user, group }, error))
      .then(
        where(is.among(error, [null]), MemberMayAccessGroup({ user, group }))
          .then(MembershipTracking.invite({ inviter: user, group, invitee }).responds({ invitation }))
          .then(respond({ invitation })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "group", "invitee"]),
  );

  const LeaveGroup = endpoint("/groups/leave", ({ user, group, error }) =>
    receive({ user, group })
      .where(compute(calculations.groupAccessError, { user, group }, error))
      .then(
        where(is.among(error, [null]), MemberMayAccessGroup({ user, group }))
          .then(MembershipTracking.leave({ user, group }).responds({}))
          .then(respond({ success: true })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "group"]),
  );

  const GetCapture = endpoint("/captures/get", ({ user, capture, error }) =>
    receive({ user, capture })
      .where(compute(calculations.captureAccessError, { user, capture }, error))
      .then(
        where(is.among(error, [null]))
          .then(respond({ preview: CapturePreview({ capture }) })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "capture"]),
  );

  const AddToGroup = endpoint("/activities/add-to-group", ({ user, group, activity, error, suggestion }) =>
    receive({ user, group, activity })
      .where(compute(calculations.addAccessError, { user, group, activity }, error))
      .then(
        where(is.among(error, [null]), MemberMayAccessGroup({ user, group }))
          .then(Suggesting.suggest({ user, group, item: activity }).responds({ suggestion }))
          .then(respond({ suggestion })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "group", "activity"]),
  );

  const WithdrawSuggestion = endpoint("/activities/withdraw", ({ user, suggestion, error }) =>
    receive({ user, suggestion })
      .where(compute(calculations.withdrawalAccessError, { user, suggestion }, error))
      .then(
        where(is.among(error, [null]))
          .then(Suggesting.withdraw({ user, suggestion }).responds({}))
          .then(respond({ success: true })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "suggestion"]),
  );

  const ListActivities = endpoint("/activities/list", ({ user, group, error }) =>
    receive({ user, group })
      .where(compute(calculations.groupAccessError, { user, group }, error))
      .then(
        where(is.among(error, [null]), MemberMayAccessGroup({ user, group }))
          .then(respond({ book: GroupCollection({ group }) })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "group"]),
  );

  const GetActivity = endpoint("/activities/get", ({ user, group, activity, error }) =>
    receive({ user, group, activity })
      .where(compute(calculations.activityAccessError, { user, group, activity }, error))
      .then(
        where(is.among(error, [null]), MemberMayAccessActivity({ user, group, activity }))
          .then(respond({ page: ActivityPage({ group, activity }) })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "group", "activity"]),
  );

  const WantActivity = endpoint("/activities/want", ({ user, group, activity, error }) =>
    receive({ user, group, activity })
      .where(compute(calculations.activityAccessError, { user, group, activity }, error))
      .then(
        where(is.among(error, [null]), MemberMayAccessActivity({ user, group, activity }))
          .then(Wanting.want({ user, item: activity }).responds({}))
          .then(respond({ success: true })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "group", "activity"]),
  );

  const UnwantActivity = endpoint("/activities/unwant", ({ user, group, activity, error }) =>
    receive({ user, group, activity })
      .where(compute(calculations.activityAccessError, { user, group, activity }, error))
      .then(
        where(is.among(error, [null]), MemberMayAccessActivity({ user, group, activity }))
          .then(Wanting.unwant({ user, item: activity }).responds({}))
          .then(respond({ success: true })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "group", "activity"]),
  );

  const CompleteActivity = endpoint("/activities/complete", ({ user, group, activity, error, experience }) =>
    receive({ user, group, activity })
      .where(compute(calculations.activityAccessError, { user, group, activity }, error))
      .then(
        where(is.among(error, [null]), MemberMayAccessActivity({ user, group, activity }))
          .then(Experiencing.complete({ user, item: activity }).responds({ experience }))
          .then(respond({ experience })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "group", "activity"]),
  );

  const SetRepeatPreference = endpoint("/activities/repeat-preference", ({ user, group, activity, preference, error }) =>
    receive({ user, group, activity, preference })
      .where(compute(calculations.activityAccessError, { user, group, activity }, error))
      .then(
        where(is.among(error, [null]), MemberMayAccessActivity({ user, group, activity }))
          .then(Experiencing.setRepeatPreference({ user, item: activity, preference }).responds({}))
          .then(respond({ success: true })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "group", "activity", "preference"]),
  );

  const UndoCompletion = endpoint("/activities/undo-completion", ({ user, group, activity, error }) =>
    receive({ user, group, activity })
      .where(compute(calculations.activityAccessError, { user, group, activity }, error))
      .then(
        where(is.among(error, [null]), MemberMayAccessActivity({ user, group, activity }))
          .then(Experiencing.undoCompletion({ user, item: activity }).responds({}))
          .then(respond({ success: true })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "group", "activity"]),
  );

  const PickForNow = endpoint("/pick/options", ({ user, group, participants, category, location, maxCost, currency, from, until, filters, error }) =>
    receive({ user, group, participants, category, location, maxCost, currency, from, until })
      .where(compute(calculations.pickFilters, { category, location, maxCost, currency, from, until }, filters),
        compute(calculations.pickAccessError, { user, group, participants, filters }, error))
      .then(
        where(is.among(error, [null]), ValidParticipants({ group, participants, filters }))
          .then(respond({ book: PickOptions({ group, participants, filters }) })).named("allowed"),
        where(is.among(error, errors)).then(respond({ error })).named("refused"),
      ), options(["user", "group", "participants"], filterKeys),
  );

  return {
    MemberMayAccessGroup, MemberMayAccessActivity, ValidParticipants,
    GroupList, GroupPage, InvitationInbox, CapturePreview, GroupCollection, ActivityPage, PickOptions,
    SuggestionCreatesWant, CompletionClearsWant, RepeatYesCreatesWant, RepeatNoClearsWant, CaptureStartedProposesDetails,
    ListGroups, CreateGroup, ListInvitations, AcceptInvitation, DeclineInvitation, StartCapture, ConfirmCapture, DiscardCapture, GetGroup, Invite, LeaveGroup, GetCapture, AddToGroup, WithdrawSuggestion, ListActivities, GetActivity, WantActivity, UnwantActivity, CompleteActivity, SetRepeatPreference, UndoCompletion, PickForNow,
  };
}
