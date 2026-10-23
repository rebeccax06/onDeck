# OnDeck

OnDeck combines MembershipTracking, GroupOrdering, ActivityCapturing, Suggesting, Wanting, and Experiencing to support shared activities and Pick for Now.

## Request identity and refusals

The host supplies the authenticated Person as user. Missing or invalid authentication refuses UNAUTHORIZED; clients cannot choose another actor.

Group operations require membership except creation, personal listings, and accepting/declining an invitation. Check existence before membership: NO_SUCH_GROUP precedes NOT_A_MEMBER. Captures require ownership. Missing resources and concept refusals propagate; rejected requests leave state unchanged.

[MemberMayAccessGroup](view:OnDeck.MemberMayAccessGroup) checks membership. [MemberMayAccessActivity](view:OnDeck.MemberMayAccessActivity) also requires a suggestion in that group, refusing ACTIVITY_NOT_IN_GROUP otherwise.

## Groups and invitations

[ListGroups](reaction:OnDeck.ListGroups) returns [GroupList](former:OnDeck.GroupList): current member groups, covers, member summaries, and personal order through groupCards. Unordered groups follow by name then identity. [CreateGroup](reaction:OnDeck.CreateGroup) calls MembershipTracking.create, making the caller its first member.

```endpoints
OnDeck.ListGroups at /groups/list
OnDeck.CreateGroup at /groups/create
```

[GetGroup](reaction:OnDeck.GetGroup) returns [GroupPage](former:OnDeck.GroupPage) with group identity, name, and members. [Invite](reaction:OnDeck.Invite) calls MembershipTracking.invite for an existing Person. [LeaveGroup](reaction:OnDeck.LeaveGroup) calls MembershipTracking.leave, retaining activities, preferences, and pending invitations. Members have equal privileges; empty groups remain stored.

```endpoints
OnDeck.GetGroup at /groups/get
OnDeck.Invite at /groups/invite
OnDeck.LeaveGroup at /groups/leave
```

[ListInvitations](reaction:OnDeck.ListInvitations) returns [InvitationInbox](former:OnDeck.InvitationInbox), joining pending invitations with group names. [AcceptInvitation](reaction:OnDeck.AcceptInvitation) and [DeclineInvitation](reaction:OnDeck.DeclineInvitation) call MembershipTracking.accept/decline for the recipient. Acceptance returns the joined group.

```endpoints
OnDeck.ListInvitations at /invitations/list
OnDeck.AcceptInvitation at /invitations/accept
OnDeck.DeclineInvitation at /invitations/decline
```

## Quick Add

[StartCapture](reaction:OnDeck.StartCapture) calls ActivityCapturing.start with a URL or description and returns its capture identity.

[CaptureStartedProposesDetails](reaction:OnDeck.CaptureStartedProposesDetails) optionally calls ActivityCapturing.propose. Extraction failure leaves manual entry available; late proposals have no effect on consumed captures.

[GetCapture](reaction:OnDeck.GetCapture) returns [CapturePreview](former:OnDeck.CapturePreview), joining source and proposal. The owner may [confirm](reaction:OnDeck.ConfirmCapture) edited details through ActivityCapturing.confirm or [discard](reaction:OnDeck.DiscardCapture) through ActivityCapturing.discard. Confirmation creates an activity without sharing or creating interest.

```endpoints
OnDeck.StartCapture at /captures/start
OnDeck.GetCapture at /captures/get
OnDeck.ConfirmCapture at /captures/confirm
OnDeck.DiscardCapture at /captures/discard
```

A member [adds a confirmed activity to a group](reaction:OnDeck.AddToGroup). The request supplies group and activity identities, verifies membership and that ActivityCapturing._get resolves the activity, then calls Suggesting.suggest. The UI retains the activity returned by confirmation while the user chooses groups. Sharing with multiple groups uses one request per group, with separate success or refusal results so a failed group does not obscure earlier successful additions. If membership changes, remove unavailable sharing targets and explain how to continue; retain the confirmed activity and completed shares when choosing another group.

[SuggestionCreatesWant](reaction:OnDeck.SuggestionCreatesWant) calls Wanting.want after a successful suggestion if no want exists. Duplicate suggestions refuse ALREADY_SUGGESTED without changing interest.

[WithdrawSuggestion](reaction:OnDeck.WithdrawSuggestion) checks membership and calls Suggesting.withdraw for the suggester. It removes only that group association, retaining the activity and personal preferences.

```endpoints
OnDeck.AddToGroup at /activities/add-to-group
OnDeck.WithdrawSuggestion at /activities/withdraw
```

## Group Interest

[ListActivities](reaction:OnDeck.ListActivities) returns [GroupCollection](former:OnDeck.GroupCollection): suggestions joined with activity details and current members’ wants, completions, and repeat preferences, sorted by activity name then identity. Former members are excluded. Missing wants mean false; missing experiences mean not completed.

[GetActivity](reaction:OnDeck.GetActivity) returns [ActivityPage](former:OnDeck.ActivityPage) with saved details, suggestion, and a status row for every current member. It requires membership and a suggestion in the group.

```endpoints
OnDeck.ListActivities at /activities/list
OnDeck.GetActivity at /activities/get
```

After group/activity access checks, [WantActivity](reaction:OnDeck.WantActivity), [UnwantActivity](reaction:OnDeck.UnwantActivity), [CompleteActivity](reaction:OnDeck.CompleteActivity), [SetRepeatPreference](reaction:OnDeck.SetRepeatPreference), and [UndoCompletion](reaction:OnDeck.UndoCompletion) invoke the corresponding Wanting or Experiencing action for the caller.

```endpoints
OnDeck.WantActivity at /activities/want
OnDeck.UnwantActivity at /activities/unwant
OnDeck.CompleteActivity at /activities/complete
OnDeck.SetRepeatPreference at /activities/repeat-preference
OnDeck.UndoCompletion at /activities/undo-completion
```

[CompletionClearsWant](reaction:OnDeck.CompletionClearsWant) removes an existing want after completion.

[RepeatYesCreatesWant](reaction:OnDeck.RepeatYesCreatesWant) adds a missing want after repeat preference YES.

[RepeatNoClearsWant](reaction:OnDeck.RepeatNoClearsWant) removes an existing want after repeat preference NO. UNKNOWN and undoing completion leave interest unchanged. Explicit wants remain independent of repeat preference. Coordinated effects settle before responding and can resume without duplication.

## Pick for Now

[PickForNow](reaction:OnDeck.PickForNow) reads options for a group and selected participants. [ValidParticipants](view:OnDeck.ValidParticipants) deduplicates identities and requires a nonempty subset of current members; the caller need not be selected. Refusals are NO_PARTICIPANTS, INVALID_PARTICIPANTS, or INVALID_FILTERS.

[PickOptions](former:OnDeck.PickOptions) joins group suggestions with details and selected participants’ preferences. Filters combine with AND: category is a trimmed case-insensitive exact match; location is a trimmed case-insensitive substring; date bounds are inclusive timezone-bearing instants. Budget requires a finite nonnegative maxCost and supported currency together, matching known costs in that currency without conversion. Invalid or reversed bounds refuse INVALID_FILTERS. Blank text filters are omitted; missing activity fields exclude an option only when that filter is active.

Return at most ten options, ranked by wanted count descending, wanted-without-completion count descending, then name and identity ascending. Include participant statuses, counts for wants/completions/repeat YES, and applied filters. Completed and zero-interest activities remain eligible. No matches returns an empty list; this read changes no state.

```endpoints
OnDeck.PickForNow at /pick/options
```

## Application read calculations

Read calculations query concepts without changing state.

```computations
groupAccessError(user: String, group: String) : String | null
  Returns NO_SUCH_GROUP, NOT_A_MEMBER, or null in that precedence order.
activityAccessError(user: String, group: String, activity: String) : String | null
  Checks group access, activity existence, and the group's suggestion in that order.
addAccessError(user: String, group: String, activity: String) : String | null
  Checks group access and activity existence before creating a suggestion.
captureAccessError(user: String, capture: String) : String | null
  Returns NO_SUCH_CAPTURE, NOT_CAPTURE_OWNER, or null.
withdrawalAccessError(user: String, suggestion: String) : String | null
  Resolves the suggestion and checks access to its group before withdrawal.
participantError(group: String, participants: String[], filters: Json) : String | null
  Checks nonempty current participants and valid filters as specified above.
groupCollection(group: String) : Json
  Joins suggestions, details, and current member statuses in activity-name and identity order.
activityPage(group: String, activity: String) : Json
  Returns the group's activity row with every current member's status, or null if absent.
capturePreview(capture: String) : Json
  Joins a capture's original source and owner to its optional proposal.
pickOptions(group: String, participants: String[], filters: Json) : Json
  Deduplicates participants, applies the specified filters, ranks and limits the options,
  and returns options with the selected participants and applied filters.
pickAccessError(user: String, group: String, participants: String[], filters: Json) : String | null
  Checks group access before participant and filter validity.
pickFilters(category: String | null, location: String | null, maxCost: Number | null, currency: String | null, from: String | null, until: String | null) : Json
  Assembles supplied optional filters; null represents an omitted input.
extractDetails(source: String) : Json
  Invokes the optional extraction integration and validates its proposed fields.
  Returns absent proposal fields as null when unsupported, invalid, or unsuccessful.
```

## Group order and invitation links

[SaveGroupOrder](reaction:OnDeck.SaveGroupOrder) calls GroupOrdering.save for the caller. Saved IDs cannot expose nonmember groups.

[CreateInviteLink](reaction:OnDeck.CreateInviteLink), [ListInviteLinks](reaction:OnDeck.ListInviteLinks), [RevokeInviteLink](reaction:OnDeck.RevokeInviteLink), and [JoinInviteLink](reaction:OnDeck.JoinInviteLink) use MembershipTracking’s link actions/queries. Management requires membership. [InviteLinks](former:OnDeck.InviteLinks) returns identities and expiration without tokens. Links are reusable until revoked or expired; repeated joining is idempotent, and the inviter leaving does not revoke them.

Authenticated link previews expose only the group name. Joining requires sign-in; dismissing a preview does not revoke the link.

```endpoints
OnDeck.SaveGroupOrder at /groups/order
OnDeck.CreateInviteLink at /groups/create-link
OnDeck.ListInviteLinks at /groups/links
OnDeck.RevokeInviteLink at /groups/revoke-link
OnDeck.JoinInviteLink at /invitations/join-link
```

```computations
groupCards(user: String) : Json
  Returns only current member groups, their member IDs, covers, and personal saved ordering;
  groups absent from the saved order follow by name then identity.
```

## Group editing and deletion

[UpdateGroup](reaction:OnDeck.UpdateGroup) calls MembershipTracking.updateGroup for a current member, changing the name or cover. Invalid input preserves the group.

[DeleteGroup](reaction:OnDeck.DeleteGroup) calls MembershipTracking.deleteGroup for a current member. It atomically removes the group and invitations, retaining shared activities and personal preferences. Remaining suggestions are inaccessible through the deleted group; saved ordering ignores its identity.

```endpoints
OnDeck.UpdateGroup at /groups/update
OnDeck.DeleteGroup at /groups/delete
```

## Live views

Successful mutations notify affected members, the actor, and direct invitees after coordinated effects settle. Notices contain no group data; clients re-read authorized views. Membership changes notify previous and current members. Reconnect refreshes the view. Background reads preserve unfinished input and cannot apply stale account/group responses.

[API details](../../docs/api.md) and the [user journey](../../user-journey.md) are documented separately. Design decisions are recorded in the private design notebook.

Frontend validation includes bundling the stylesheet with Bun alongside design, generated-artifact, and TypeScript checks. Removing a UI feature must remove complete obsolete style rules, leaving no orphaned declarations.
