<!-- Generated from the OnDeck assembly. Do not edit. -->
<!-- Manifest producer: @mit-sdg/sync-engine@1.1.0; concept specification: sync-engine.concept-specification@1; renderer: @mit-sdg/sync-engine@1.1.0. -->

# OnDeck — assembled read-back

_Assembled by sync-engine from registered concepts and composition. Edit the concept_
_specifications and composition source, then regenerate this file._

## Concepts

### ActivityCapturing

Defined in [ActivityCapturing](../design/concepts/ActivityCapturing.md), line 1.

#### Actions

- `start(user: User, source: String) : returns (capture: Capture)`
  - Refuses `EMPTY_SOURCE`: Paste a link or enter a description.
- `propose(capture: Capture, name: String, source?: String, description?: String, location?: String, category?: String, cost?: Number, currency?: String, dateTime?: DateTime) : returns ()`
  - Refuses `NO_SUCH_CAPTURE`: There is no such capture.
  - Refuses `INVALID_DETAILS`: Provide a name, valid dates, and a nonnegative cost with its currency when known.
- `confirm(user: User, capture: Capture, name: String, source?: String, description?: String, location?: String, category?: String, cost?: Number, currency?: String, dateTime?: DateTime) : returns (activity: Activity)`
  - Refuses `NO_SUCH_CAPTURE`: There is no such capture.
  - Refuses `NOT_CAPTURE_OWNER`: Only the owner can confirm this capture.
  - Refuses `INVALID_DETAILS`: Provide a name, valid dates, and a nonnegative cost with its currency when known.
- `discard(user: User, capture: Capture) : returns ()`
  - Refuses `NO_SUCH_CAPTURE`: There is no such capture.
  - Refuses `NOT_CAPTURE_OWNER`: Only the owner can discard this capture.

#### Queries

- `_capture(capture: Capture) : optional (capture: Capture, owner: User, source: String)`
- `_proposal(capture: Capture) : optional (name: String, source?: String, description?: String, location?: String, category?: String, cost?: Number, currency?: String, dateTime?: DateTime)`
- `_get(activity: Activity) : optional (activity: Activity, name: String, source?: String, description?: String, location?: String, category?: String, cost?: Number, currency?: String, dateTime?: DateTime)`

#### Instances

- `ActivityCapturing` — instance of `ActivityCapturing` — [Application types](../design/types.md), line 15.
  - `User` is `Person` — [Application types](../design/types.md), line 16.

### Experiencing

Defined in [Experiencing](../design/concepts/Experiencing.md), line 1.

#### Actions

- `complete(user: User, item: Item) : returns (experience: Experience)`
  - Refuses `ALREADY_COMPLETED`: You already recorded doing this.
- `setRepeatPreference(user: User, item: Item, preference: RepeatPreference) : returns ()`
  - Refuses `INVALID_PREFERENCE`: Choose UNKNOWN, YES, or NO.
  - Refuses `NOT_COMPLETED`: Record doing this before setting a repeat preference.
- `undoCompletion(user: User, item: Item) : returns ()`
  - Refuses `NOT_COMPLETED`: You have not recorded doing this.

#### Queries

- `_get(user: User, item: Item) : optional (experience: Experience, repeatPreference: RepeatPreference)`
- `_forItem(item: Item) : many (experience: Experience, user: User, repeatPreference: RepeatPreference)`

#### Instances

- `Experiencing` — instance of `Experiencing` — [Application types](../design/types.md), line 27.
  - `Item` is `ActivityCapturing.Activity` — [Application types](../design/types.md), line 29.
  - `User` is `Person` — [Application types](../design/types.md), line 28.

### MembershipTracking

Defined in [MembershipTracking](../design/concepts/MembershipTracking.md), line 1.

#### Actions

- `create(creator: User, name: String) : returns (group: Group)`
  - Refuses `INVALID_NAME`: Give the group a name.
- `invite(inviter: User, group: Group, invitee: User) : returns (invitation: Invitation)`
  - Refuses `NO_SUCH_GROUP`: There is no such group.
  - Refuses `NOT_A_MEMBER`: Only members can invite someone.
  - Refuses `ALREADY_A_MEMBER`: That person already belongs to the group.
  - Refuses `ALREADY_INVITED`: That person already has an invitation.
- `accept(invitee: User, invitation: Invitation) : returns (group: Group)`
  - Refuses `NO_SUCH_INVITATION`: There is no such invitation.
  - Refuses `NOT_INVITED`: This invitation is for someone else.
- `decline(invitee: User, invitation: Invitation) : returns ()`
  - Refuses `NO_SUCH_INVITATION`: There is no such invitation.
  - Refuses `NOT_INVITED`: This invitation is for someone else.
- `leave(user: User, group: Group) : returns ()`
  - Refuses `NO_SUCH_GROUP`: There is no such group.
  - Refuses `NOT_A_MEMBER`: You do not belong to this group.

#### Queries

- `_groups(user: User) : many (group: Group, name: String)`
- `_get(group: Group) : optional (group: Group, name: String)`
- `_members(group: Group) : many (user: User)`
- `_membership(user: User, group: Group) : one (member: Flag)`
- `_invitations(invitee: User) : many (invitation: Invitation, group: Group, inviter: User)`
- `_invitation(invitation: Invitation) : optional (invitation: Invitation, group: Group, inviter: User, invitee: User)`

#### Instances

- `MembershipTracking` — instance of `MembershipTracking` — [Application types](../design/types.md), line 12.
  - `User` is `Person` — [Application types](../design/types.md), line 13.

### Suggesting

Defined in [Suggesting](../design/concepts/Suggesting.md), line 1.

#### Actions

- `suggest(user: User, group: Group, item: Item) : returns (suggestion: Suggestion)`
  - Refuses `ALREADY_SUGGESTED`: That item is already in the group’s collection.
- `withdraw(user: User, suggestion: Suggestion) : returns ()`
  - Refuses `NO_SUCH_SUGGESTION`: There is no such suggestion.
  - Refuses `NOT_SUGGESTER`: Only the suggester can withdraw this item.

#### Queries

- `_forGroup(group: Group) : many (suggestion: Suggestion, suggester: User, item: Item)`
- `_get(suggestion: Suggestion) : optional (suggestion: Suggestion, suggester: User, group: Group, item: Item)`
- `_contains(group: Group, item: Item) : one (suggested: Flag)`

#### Instances

- `Suggesting` — instance of `Suggesting` — [Application types](../design/types.md), line 18.
  - `Group` is `MembershipTracking.Group` — [Application types](../design/types.md), line 20.
  - `Item` is `ActivityCapturing.Activity` — [Application types](../design/types.md), line 21.
  - `User` is `Person` — [Application types](../design/types.md), line 19.

### Wanting

Defined in [Wanting](../design/concepts/Wanting.md), line 1.

#### Actions

- `want(user: User, item: Item) : returns ()`
  - Refuses `ALREADY_WANTED`: You already want to do this.
- `unwant(user: User, item: Item) : returns ()`
  - Refuses `NOT_WANTED`: You have not marked this as wanted.

#### Queries

- `_wants(user: User, item: Item) : one (wanted: Flag)`
- `_forItem(item: Item) : many (user: User)`
- `_forUser(user: User) : many (item: Item)`

#### Instances

- `Wanting` — instance of `Wanting` — [Application types](../design/types.md), line 23.
  - `Item` is `ActivityCapturing.Activity` — [Application types](../design/types.md), line 25.
  - `User` is `Person` — [Application types](../design/types.md), line 24.

## Application types

Concrete types:

- `Person` — [Application types](../design/types.md), line 7.

## Computations

- `activityAccessError(user: String, group: String, activity: String) : String | null` — [OnDeck](../design/compositions/OnDeck.md), line 104.
- `activityPage(group: String, activity: String) : Json` — [OnDeck](../design/compositions/OnDeck.md), line 116.
- `addAccessError(user: String, group: String, activity: String) : String | null` — [OnDeck](../design/compositions/OnDeck.md), line 106.
- `captureAccessError(user: String, capture: String) : String | null` — [OnDeck](../design/compositions/OnDeck.md), line 108.
- `capturePreview(capture: String) : Json` — [OnDeck](../design/compositions/OnDeck.md), line 118.
- `extractDetails(source: String) : Json` — [OnDeck](../design/compositions/OnDeck.md), line 127.
- `groupAccessError(user: String, group: String) : String | null` — [OnDeck](../design/compositions/OnDeck.md), line 102.
- `groupCollection(group: String) : Json` — [OnDeck](../design/compositions/OnDeck.md), line 114.
- `participantError(group: String, participants: String[], filters: Json) : String | null` — [OnDeck](../design/compositions/OnDeck.md), line 112.
- `pickAccessError(user: String, group: String, participants: String[], filters: Json) : String | null` — [OnDeck](../design/compositions/OnDeck.md), line 123.
- `pickFilters(category: String | null, location: String | null, maxCost: Number | null, currency: String | null, from: String | null, until: String | null) : Json` — [OnDeck](../design/compositions/OnDeck.md), line 125.
- `pickOptions(group: String, participants: String[], filters: Json) : Json` — [OnDeck](../design/compositions/OnDeck.md), line 120.
- `withdrawalAccessError(user: String, suggestion: String) : String | null` — [OnDeck](../design/compositions/OnDeck.md), line 110.

## Views

_Views name reusable conditions. Multiple `where` blocks are alternatives._

### (user) may access (group)

Authored path: `OnDeck.MemberMayAccessGroup`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 11.

```view
(user) may access (group) — inputs (user, group); outputs (); bindings ()
  where MembershipTracking._membership (group, user) has (member: true)
```

### (user) may access (activity) in (group)

Authored path: `OnDeck.MemberMayAccessActivity`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 11.

```view
(user) may access (activity) in (group) — inputs (user, group, activity); outputs (); bindings ()
  where
    view "(user) may access (group)" with (group, user)
    Suggesting._contains (group, item: activity) has (suggested: true)
```

### valid (participants) and (filters) in (group)

Authored path: `OnDeck.ValidParticipants`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 87.

```view
valid (participants) and (filters) in (group) — inputs (group, participants, filters); outputs (); bindings (error)
  where
    error is participantError (filters, group, participants)
    error is among [null]
```

## Formers

_Formers name result shapes evaluated when asked. The source former owns_
_the authored explanation; this section records the generated shape._

### activity page (activity) in (group)

Authored path: `OnDeck.ActivityPage`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 66.

```former
Former "activity page (activity) in (group)" — inputs (group, activity); bindings (page); promises exactly one record — forms:
  a record of
    where page is activityPage (activity, group)
    activity: page
```

### capture preview (capture)

Authored path: `OnDeck.CapturePreview`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 42.

```former
Former "capture preview (capture)" — inputs (capture); bindings (preview); promises exactly one record — forms:
  a record of
    where preview is capturePreview (capture)
    capture: preview
```

### collection for (group)

Authored path: `OnDeck.GroupCollection`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 64.

```former
Former "collection for (group)" — inputs (group); bindings (activities); promises exactly one record — forms:
  a record of
    where activities is groupCollection (group)
    activities
```

### groups for (user)

Authored path: `OnDeck.GroupList`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 15.

```former
Former "groups for (user)" — inputs (user); bindings (group, name); promises exactly one record — forms:
  a record of
    groups: each MembershipTracking._groups (user) has (group, name)
      form a record of
        group
        name
```

### invitations for (user)

Authored path: `OnDeck.InvitationInbox`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 30.

```former
Former "invitations for (user)" — inputs (user); bindings (invitation, group, inviter, name); promises exactly one record — forms:
  a record of
    invitations: each MembershipTracking._invitations (invitee: user) has (group, invitation, inviter)
      where MembershipTracking._get (group) has (name)
      form a record of
        group
        invitation
        inviter
        name
```

### options for (participants) in (group) with (filters)

Authored path: `OnDeck.PickOptions`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 89.

```former
Former "options for (participants) in (group) with (filters)" — inputs (group, participants, filters); bindings (result); promises exactly one record — forms:
  a record of
    where result is pickOptions (filters, group, participants)
    result
```

### the group page (group)

Authored path: `OnDeck.GroupPage`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 22.

```former
Former "the group page (group)" — inputs (group); bindings (name, user); promises exactly one record — forms:
  a record of
    where MembershipTracking._get (group) has (name)
    group
    members: each MembershipTracking._members (group) has (user)
      form a record of
        user
    name
```

## Reactions

### DeliverFaultToAsker

```reaction
when any action is faulted, not asked by DeliverFaultToAsker
where
  earlier, RequestBoundary.request (requestId)
then
  RequestBoundary.respondFramework (error: "INTERNAL_ERROR", requestId)
```

### DeliverRefusalToAsker

```reaction
when any action is refused (message), except RequestBoundary
where
  earlier, RequestBoundary.request (requestId)
then
  RequestBoundary.respond (error: message, requestId)
```

### OnDeck.AcceptInvitation

Authored path: `OnDeck.AcceptInvitation`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 30.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 34.

```reaction
when RequestBoundary.request (invitation, path: "/invitations/accept", requestId, user)
then
  MembershipTracking.accept (invitation, invitee: user)
```

### OnDeck.AcceptInvitation#2

Authored path: `OnDeck.AcceptInvitation`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 30.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 34.

```reaction
when MembershipTracking.accept (invitation, invitee: user, group), asked by OnDeck.AcceptInvitation
where
  earlier, RequestBoundary.request (invitation, path: "/invitations/accept", requestId, user)
then
  RequestBoundary.respond (group, requestId)
```

### OnDeck.AddToGroup:allowed

Authored path: `OnDeck.AddToGroup`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 51.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 58.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/add-to-group", requestId, user)
where
  error is addAccessError (activity, group, user)
  error is among [null]
  view "(user) may access (group)" with (group, user)
then
  Suggesting.suggest (group, item: activity, user)
```

### OnDeck.AddToGroup:allowed#2

Authored path: `OnDeck.AddToGroup`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 51.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 58.

```reaction
when Suggesting.suggest (group, item: activity, user, suggestion), asked by OnDeck.AddToGroup:allowed
where
  earlier, RequestBoundary.request (activity, group, path: "/activities/add-to-group", requestId, user)
then
  RequestBoundary.respond (requestId, suggestion)
```

### OnDeck.AddToGroup:refused

Authored path: `OnDeck.AddToGroup`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 51.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 58.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/add-to-group", requestId, user)
where
  error is addAccessError (activity, group, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

### OnDeck.CaptureStartedProposesDetails

Authored path: `OnDeck.CaptureStartedProposesDetails`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 40.

```reaction
when ActivityCapturing.start (source, capture)
where
  (category, cost, currency, dateTime, description, location, name, proposedSource) is extractDetails (source)
  name is greater than ""
  ActivityCapturing._capture (capture)
then
  ActivityCapturing.propose (capture, category, cost, currency, dateTime, description, location, name, source: proposedSource)
```

### OnDeck.CompleteActivity:allowed

Authored path: `OnDeck.CompleteActivity`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 78.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/complete", requestId, user)
where
  error is activityAccessError (activity, group, user)
  error is among [null]
  view "(user) may access (activity) in (group)" with (activity, group, user)
then
  Experiencing.complete (item: activity, user)
```

### OnDeck.CompleteActivity:allowed#2

Authored path: `OnDeck.CompleteActivity`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 78.

```reaction
when Experiencing.complete (item: activity, user, experience), asked by OnDeck.CompleteActivity:allowed
where
  earlier, RequestBoundary.request (activity, group, path: "/activities/complete", requestId, user)
then
  RequestBoundary.respond (experience, requestId)
```

### OnDeck.CompleteActivity:refused

Authored path: `OnDeck.CompleteActivity`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 78.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/complete", requestId, user)
where
  error is activityAccessError (activity, group, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

### OnDeck.CompletionClearsWant

Authored path: `OnDeck.CompletionClearsWant`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 83.

```reaction
when Experiencing.complete (item, user)
where
  Wanting._wants (item, user) has (wanted: true)
then
  Wanting.unwant (item, user)
```

### OnDeck.ConfirmCapture

Authored path: `OnDeck.ConfirmCapture`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 42.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 47.

```reaction
when RequestBoundary.request (capture, category, cost, currency, dateTime, description, location, name, path: "/captures/confirm", requestId, source, user)
then
  ActivityCapturing.confirm (capture, category, cost, currency, dateTime, description, location, name, source, user)
```

### OnDeck.ConfirmCapture#2

Authored path: `OnDeck.ConfirmCapture`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 42.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 47.

```reaction
when ActivityCapturing.confirm (capture, category, cost, currency, dateTime, description, location, name, source, user, activity), asked by OnDeck.ConfirmCapture
where
  earlier, RequestBoundary.request (capture, category, cost, currency, dateTime, description, location, name, path: "/captures/confirm", requestId, source, user)
then
  RequestBoundary.respond (activity, requestId)
```

### OnDeck.CreateGroup

Authored path: `OnDeck.CreateGroup`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 15.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 19.

```reaction
when RequestBoundary.request (name, path: "/groups/create", requestId, user)
then
  MembershipTracking.create (creator: user, name)
```

### OnDeck.CreateGroup#2

Authored path: `OnDeck.CreateGroup`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 15.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 19.

```reaction
when MembershipTracking.create (creator: user, name, group), asked by OnDeck.CreateGroup
where
  earlier, RequestBoundary.request (name, path: "/groups/create", requestId, user)
then
  RequestBoundary.respond (group, requestId)
```

### OnDeck.DeclineInvitation

Authored path: `OnDeck.DeclineInvitation`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 30.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 35.

```reaction
when RequestBoundary.request (invitation, path: "/invitations/decline", requestId, user)
then
  MembershipTracking.decline (invitation, invitee: user)
```

### OnDeck.DeclineInvitation#2

Authored path: `OnDeck.DeclineInvitation`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 30.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 35.

```reaction
when MembershipTracking.decline (invitation, invitee: user), asked by OnDeck.DeclineInvitation
where
  earlier, RequestBoundary.request (invitation, path: "/invitations/decline", requestId, user)
then
  RequestBoundary.respond (requestId, success: true)
```

### OnDeck.DiscardCapture

Authored path: `OnDeck.DiscardCapture`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 42.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 48.

```reaction
when RequestBoundary.request (capture, path: "/captures/discard", requestId, user)
then
  ActivityCapturing.discard (capture, user)
```

### OnDeck.DiscardCapture#2

Authored path: `OnDeck.DiscardCapture`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 42.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 48.

```reaction
when ActivityCapturing.discard (capture, user), asked by OnDeck.DiscardCapture
where
  earlier, RequestBoundary.request (capture, path: "/captures/discard", requestId, user)
then
  RequestBoundary.respond (requestId, success: true)
```

### OnDeck.GetActivity:allowed

Authored path: `OnDeck.GetActivity`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 66.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 70.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/get", requestId, user)
where
  error is activityAccessError (activity, group, user)
  error is among [null]
  view "(user) may access (activity) in (group)" with (activity, group, user)
then
  RequestBoundary.respond (page: former "activity page (activity) in (group)" with (activity, group), requestId)
```

### OnDeck.GetActivity:refused

Authored path: `OnDeck.GetActivity`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 66.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 70.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/get", requestId, user)
where
  error is activityAccessError (activity, group, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

### OnDeck.GetCapture:allowed

Authored path: `OnDeck.GetCapture`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 42.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 46.

```reaction
when RequestBoundary.request (capture, path: "/captures/get", requestId, user)
where
  error is captureAccessError (capture, user)
  error is among [null]
then
  RequestBoundary.respond (preview: former "capture preview (capture)" with (capture), requestId)
```

### OnDeck.GetCapture:refused

Authored path: `OnDeck.GetCapture`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 42.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 46.

```reaction
when RequestBoundary.request (capture, path: "/captures/get", requestId, user)
where
  error is captureAccessError (capture, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

### OnDeck.GetGroup:allowed

Authored path: `OnDeck.GetGroup`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 22.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 25.

```reaction
when RequestBoundary.request (group, path: "/groups/get", requestId, user)
where
  error is groupAccessError (group, user)
  error is among [null]
  view "(user) may access (group)" with (group, user)
then
  RequestBoundary.respond (page: former "the group page (group)" with (group), requestId)
```

### OnDeck.GetGroup:refused

Authored path: `OnDeck.GetGroup`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 22.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 25.

```reaction
when RequestBoundary.request (group, path: "/groups/get", requestId, user)
where
  error is groupAccessError (group, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

### OnDeck.Invite:allowed

Authored path: `OnDeck.Invite`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 22.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 26.

```reaction
when RequestBoundary.request (group, invitee, path: "/groups/invite", requestId, user)
where
  error is groupAccessError (group, user)
  error is among [null]
  view "(user) may access (group)" with (group, user)
then
  MembershipTracking.invite (group, invitee, inviter: user)
```

### OnDeck.Invite:allowed#2

Authored path: `OnDeck.Invite`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 22.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 26.

```reaction
when MembershipTracking.invite (group, invitee, inviter: user, invitation), asked by OnDeck.Invite:allowed
where
  earlier, RequestBoundary.request (group, invitee, path: "/groups/invite", requestId, user)
then
  RequestBoundary.respond (invitation, requestId)
```

### OnDeck.Invite:refused

Authored path: `OnDeck.Invite`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 22.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 26.

```reaction
when RequestBoundary.request (group, invitee, path: "/groups/invite", requestId, user)
where
  error is groupAccessError (group, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

### OnDeck.LeaveGroup:allowed

Authored path: `OnDeck.LeaveGroup`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 22.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 27.

```reaction
when RequestBoundary.request (group, path: "/groups/leave", requestId, user)
where
  error is groupAccessError (group, user)
  error is among [null]
  view "(user) may access (group)" with (group, user)
then
  MembershipTracking.leave (group, user)
```

### OnDeck.LeaveGroup:allowed#2

Authored path: `OnDeck.LeaveGroup`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 22.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 27.

```reaction
when MembershipTracking.leave (group, user), asked by OnDeck.LeaveGroup:allowed
where
  earlier, RequestBoundary.request (group, path: "/groups/leave", requestId, user)
then
  RequestBoundary.respond (requestId, success: true)
```

### OnDeck.LeaveGroup:refused

Authored path: `OnDeck.LeaveGroup`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 22.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 27.

```reaction
when RequestBoundary.request (group, path: "/groups/leave", requestId, user)
where
  error is groupAccessError (group, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

### OnDeck.ListActivities:allowed

Authored path: `OnDeck.ListActivities`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 64.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 69.

```reaction
when RequestBoundary.request (group, path: "/activities/list", requestId, user)
where
  error is groupAccessError (group, user)
  error is among [null]
  view "(user) may access (group)" with (group, user)
then
  RequestBoundary.respond (book: former "collection for (group)" with (group), requestId)
```

### OnDeck.ListActivities:refused

Authored path: `OnDeck.ListActivities`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 64.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 69.

```reaction
when RequestBoundary.request (group, path: "/activities/list", requestId, user)
where
  error is groupAccessError (group, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

### OnDeck.ListGroups

Authored path: `OnDeck.ListGroups`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 15.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 18.

```reaction
when RequestBoundary.request (path: "/groups/list", requestId, user)
then
  RequestBoundary.respond (book: former "groups for (user)" with (user), requestId)
```

### OnDeck.ListInvitations

Authored path: `OnDeck.ListInvitations`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 30.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 33.

```reaction
when RequestBoundary.request (path: "/invitations/list", requestId, user)
then
  RequestBoundary.respond (inbox: former "invitations for (user)" with (user), requestId)
```

### OnDeck.PickForNow:allowed

Authored path: `OnDeck.PickForNow`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 87.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 94.

```reaction
when RequestBoundary.request (category, currency, from, group, location, maxCost, participants, path: "/pick/options", requestId, until, user)
where
  filters is pickFilters (category, currency, from, location, maxCost, until)
  error is pickAccessError (filters, group, participants, user)
  error is among [null]
  view "valid (participants) and (filters) in (group)" with (filters, group, participants)
then
  RequestBoundary.respond (book: former "options for (participants) in (group) with (filters)" with (filters, group, participants), requestId)
```

### OnDeck.PickForNow:refused

Authored path: `OnDeck.PickForNow`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 87.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 94.

```reaction
when RequestBoundary.request (category, currency, from, group, location, maxCost, participants, path: "/pick/options", requestId, until, user)
where
  filters is pickFilters (category, currency, from, location, maxCost, until)
  error is pickAccessError (filters, group, participants, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

### OnDeck.RepeatNoClearsWant

Authored path: `OnDeck.RepeatNoClearsWant`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 83.

```reaction
when Experiencing.setRepeatPreference (item, preference: "NO", user)
where
  Wanting._wants (item, user) has (wanted: true)
then
  Wanting.unwant (item, user)
```

### OnDeck.RepeatYesCreatesWant

Authored path: `OnDeck.RepeatYesCreatesWant`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 83.

```reaction
when Experiencing.setRepeatPreference (item, preference: "YES", user)
where
  Wanting._wants (item, user) has (wanted: false)
then
  Wanting.want (item, user)
```

### OnDeck.SetRepeatPreference:allowed

Authored path: `OnDeck.SetRepeatPreference`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 79.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/repeat-preference", preference, requestId, user)
where
  error is activityAccessError (activity, group, user)
  error is among [null]
  view "(user) may access (activity) in (group)" with (activity, group, user)
then
  Experiencing.setRepeatPreference (item: activity, preference, user)
```

### OnDeck.SetRepeatPreference:allowed#2

Authored path: `OnDeck.SetRepeatPreference`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 79.

```reaction
when Experiencing.setRepeatPreference (item: activity, preference, user), asked by OnDeck.SetRepeatPreference:allowed
where
  earlier, RequestBoundary.request (activity, group, path: "/activities/repeat-preference", preference, requestId, user)
then
  RequestBoundary.respond (requestId, success: true)
```

### OnDeck.SetRepeatPreference:refused

Authored path: `OnDeck.SetRepeatPreference`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 79.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/repeat-preference", preference, requestId, user)
where
  error is activityAccessError (activity, group, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

### OnDeck.StartCapture

Authored path: `OnDeck.StartCapture`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 40.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 45.

```reaction
when RequestBoundary.request (path: "/captures/start", requestId, source, user)
then
  ActivityCapturing.start (source, user)
```

### OnDeck.StartCapture#2

Authored path: `OnDeck.StartCapture`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 40.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 45.

```reaction
when ActivityCapturing.start (source, user, capture), asked by OnDeck.StartCapture
where
  earlier, RequestBoundary.request (path: "/captures/start", requestId, source, user)
then
  RequestBoundary.respond (capture, requestId)
```

### OnDeck.SuggestionCreatesWant

Authored path: `OnDeck.SuggestionCreatesWant`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 53.

```reaction
when Suggesting.suggest (item, user)
where
  Wanting._wants (item, user) has (wanted: false)
then
  Wanting.want (item, user)
```

### OnDeck.UndoCompletion:allowed

Authored path: `OnDeck.UndoCompletion`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 80.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/undo-completion", requestId, user)
where
  error is activityAccessError (activity, group, user)
  error is among [null]
  view "(user) may access (activity) in (group)" with (activity, group, user)
then
  Experiencing.undoCompletion (item: activity, user)
```

### OnDeck.UndoCompletion:allowed#2

Authored path: `OnDeck.UndoCompletion`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 80.

```reaction
when Experiencing.undoCompletion (item: activity, user), asked by OnDeck.UndoCompletion:allowed
where
  earlier, RequestBoundary.request (activity, group, path: "/activities/undo-completion", requestId, user)
then
  RequestBoundary.respond (requestId, success: true)
```

### OnDeck.UndoCompletion:refused

Authored path: `OnDeck.UndoCompletion`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 80.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/undo-completion", requestId, user)
where
  error is activityAccessError (activity, group, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

### OnDeck.UnwantActivity:allowed

Authored path: `OnDeck.UnwantActivity`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 77.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/unwant", requestId, user)
where
  error is activityAccessError (activity, group, user)
  error is among [null]
  view "(user) may access (activity) in (group)" with (activity, group, user)
then
  Wanting.unwant (item: activity, user)
```

### OnDeck.UnwantActivity:allowed#2

Authored path: `OnDeck.UnwantActivity`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 77.

```reaction
when Wanting.unwant (item: activity, user), asked by OnDeck.UnwantActivity:allowed
where
  earlier, RequestBoundary.request (activity, group, path: "/activities/unwant", requestId, user)
then
  RequestBoundary.respond (requestId, success: true)
```

### OnDeck.UnwantActivity:refused

Authored path: `OnDeck.UnwantActivity`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 77.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/unwant", requestId, user)
where
  error is activityAccessError (activity, group, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

### OnDeck.WantActivity:allowed

Authored path: `OnDeck.WantActivity`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 76.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/want", requestId, user)
where
  error is activityAccessError (activity, group, user)
  error is among [null]
  view "(user) may access (activity) in (group)" with (activity, group, user)
then
  Wanting.want (item: activity, user)
```

### OnDeck.WantActivity:allowed#2

Authored path: `OnDeck.WantActivity`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 76.

```reaction
when Wanting.want (item: activity, user), asked by OnDeck.WantActivity:allowed
where
  earlier, RequestBoundary.request (activity, group, path: "/activities/want", requestId, user)
then
  RequestBoundary.respond (requestId, success: true)
```

### OnDeck.WantActivity:refused

Authored path: `OnDeck.WantActivity`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 73.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 76.

```reaction
when RequestBoundary.request (activity, group, path: "/activities/want", requestId, user)
where
  error is activityAccessError (activity, group, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

### OnDeck.WithdrawSuggestion:allowed

Authored path: `OnDeck.WithdrawSuggestion`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 55.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 59.

```reaction
when RequestBoundary.request (path: "/activities/withdraw", requestId, suggestion, user)
where
  error is withdrawalAccessError (suggestion, user)
  error is among [null]
then
  Suggesting.withdraw (suggestion, user)
```

### OnDeck.WithdrawSuggestion:allowed#2

Authored path: `OnDeck.WithdrawSuggestion`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 55.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 59.

```reaction
when Suggesting.withdraw (suggestion, user), asked by OnDeck.WithdrawSuggestion:allowed
where
  earlier, RequestBoundary.request (path: "/activities/withdraw", requestId, suggestion, user)
then
  RequestBoundary.respond (requestId, success: true)
```

### OnDeck.WithdrawSuggestion:refused

Authored path: `OnDeck.WithdrawSuggestion`.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 55.
- Covered by [OnDeck](../design/compositions/OnDeck.md), line 59.

```reaction
when RequestBoundary.request (path: "/activities/withdraw", requestId, suggestion, user)
where
  error is withdrawalAccessError (suggestion, user)
  error is among ["NO_SUCH_GROUP", "NOT_A_MEMBER", "NO_SUCH_ACTIVITY", "ACTIVITY_NOT_IN_GROUP", "NO_SUCH_CAPTURE", "NOT_CAPTURE_OWNER", "NO_SUCH_SUGGESTION", "NO_PARTICIPANTS", "INVALID_PARTICIPANTS", "INVALID_FILTERS"]
then
  RequestBoundary.respond (error, requestId)
```

## Endpoint input contracts

Before recording an action ask, the boundary rejects a body that is not an
object or lacks a required key. The response uses `INVALID_INPUT` and names
the path or missing key. A declared default fills an absent key. Endpoints
not listed here have no explicit input contract.

- `/activities/add-to-group` — requires `user`, `group`, `activity`
- `/activities/complete` — requires `user`, `group`, `activity`
- `/activities/get` — requires `user`, `group`, `activity`
- `/activities/list` — requires `user`, `group`
- `/activities/repeat-preference` — requires `user`, `group`, `activity`, `preference`
- `/activities/undo-completion` — requires `user`, `group`, `activity`
- `/activities/unwant` — requires `user`, `group`, `activity`
- `/activities/want` — requires `user`, `group`, `activity`
- `/activities/withdraw` — requires `user`, `suggestion`
- `/captures/confirm` — requires `user`, `capture`, `name`; fills `category` with null when absent; fills `cost` with null when absent; fills `currency` with null when absent; fills `dateTime` with null when absent; fills `description` with null when absent; fills `location` with null when absent; fills `source` with null when absent
- `/captures/discard` — requires `user`, `capture`
- `/captures/get` — requires `user`, `capture`
- `/captures/start` — requires `user`, `source`
- `/groups/create` — requires `user`, `name`
- `/groups/get` — requires `user`, `group`
- `/groups/invite` — requires `user`, `group`, `invitee`
- `/groups/leave` — requires `user`, `group`
- `/groups/list` — requires `user`
- `/invitations/accept` — requires `user`, `invitation`
- `/invitations/decline` — requires `user`, `invitation`
- `/invitations/list` — requires `user`
- `/pick/options` — requires `user`, `group`, `participants`; fills `category` with null when absent; fills `currency` with null when absent; fills `from` with null when absent; fills `location` with null when absent; fills `maxCost` with null when absent; fills `until` with null when absent
