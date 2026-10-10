# OnDeck

OnDeck connects persistent friend groups, captured activities, shared suggestions, current wants, and past experiences. Pick for Now is a composition of these facts, not another persistent concept, a vote, or an automatic booking.

## Request identity and refusals

Every frontend request uses the host's authenticated Person as user; clients cannot act as another person by supplying an arbitrary user identity. An unauthenticated request refuses UNAUTHENTICATED. 

Group reads and changes require current membership, except creating a group, listing one's groups or invitations, and accepting or declining one's own invitation.
Resolve an unknown group as NO_SUCH_GROUP before checking membership. A nonmember receives NOT_A_MEMBER and no group data. Private capture requests require ownership and refuse NOT_CAPTURE_OWNER. Resource lookups refuse the relevant NO_SUCH_CAPTURE, NO_SUCH_ACTIVITY, NO_SUCH_INVITATION, or NO_SUCH_SUGGESTION when missing. These checks run before effects; refused requests leave state unchanged. Concept refusals propagate.

The [membership relation](view:OnDeck.MemberMayAccessGroup) supplies current membership to group endpoints. The [activity access relation](view:OnDeck.MemberMayAccessActivity) requires an activity suggested to the requested group. A missing association refuses ACTIVITY_NOT_IN_GROUP. Invited users cannot browse a group until they accept.

## Groups and invitations

A user [lists their groups](reaction:OnDeck.ListGroups). The [group list](former:OnDeck.GroupList) uses MembershipTracking._groups, ordered by name then group identity, including an empty list when the user has no groups.
A user [creates a named group](reaction:OnDeck.CreateGroup) through MembershipTracking.create and becomes its first member.

```endpoints
OnDeck.ListGroups at /groups/list
OnDeck.CreateGroup at /groups/create
```

A member [opens a group](reaction:OnDeck.GetGroup). The [group page](former:OnDeck.GroupPage) includes its identity, name, and members from MembershipTracking._get and _members. A member [invites a person](reaction:OnDeck.Invite) through MembershipTracking.invite and may [leave](reaction:OnDeck.LeaveGroup) through
MembershipTracking.leave. Leaving does not erase suggestions, wants, or experiences. An empty group remains stored; existing invitations remain usable, allowing an invitee to join it later. Members have equal privileges; there is no owner role.

```endpoints
OnDeck.GetGroup at /groups/get
OnDeck.Invite at /groups/invite
OnDeck.LeaveGroup at /groups/leave
```

A user [lists their pending invitations](reaction:OnDeck.ListInvitations), using an [invitation inbox](former:OnDeck.InvitationInbox) that combines their invitations with group names. They [accept](reaction:OnDeck.AcceptInvitation) through MembershipTracking.accept or [decline](reaction:OnDeck.DeclineInvitation) through MembershipTracking.decline. Both check the invitation's invitee, rather than requiring membership. Accepting returns the joined group; declining returns success.

```endpoints
OnDeck.ListInvitations at /invitations/list
OnDeck.AcceptInvitation at /invitations/accept
OnDeck.DeclineInvitation at /invitations/decline
```

## Quick Add

A user [starts a capture](reaction:OnDeck.StartCapture) with a URL or description, calling ActivityCapturing.start and returning the capture identity immediately.
[Capture extraction](reaction:OnDeck.CaptureStartedProposesDetails) may call ActivityCapturing.propose with available detail fields. Extraction is a trusted internal integration, with no public endpoint. Unsupported sources or extraction failure leave the capture available for manual confirmation; extraction is never required. A late proposal for a confirmed or discarded capture has no further effects.

The owner [reads a capture](reaction:OnDeck.GetCapture) through the [capture preview](former:OnDeck.CapturePreview), which joins _capture and _proposal to expose source and optional proposed details. They [confirm corrected details](reaction:OnDeck.ConfirmCapture) through ActivityCapturing.confirm with the edited detail fields, returning a saved activity, or [discard the capture](reaction:OnDeck.DiscardCapture) through ActivityCapturing.discard. Confirmation accepts manual details without a proposal. It does not share the activity or create a want until the user adds it to a group.

```endpoints
OnDeck.StartCapture at /captures/start
OnDeck.GetCapture at /captures/get
OnDeck.ConfirmCapture at /captures/confirm
OnDeck.DiscardCapture at /captures/discard
```

A member [adds a confirmed activity to a group](reaction:OnDeck.AddToGroup). The request supplies group and activity identities, verifies membership and that
ActivityCapturing._get resolves the activity, then calls Suggesting.suggest. The UI retains the activity returned by confirmation while the user chooses groups.
Sharing with multiple groups uses one request per group, with separate success or refusal results so a failed group does not obscure earlier successful additions.

[Suggesting implies initial interest](reaction:OnDeck.SuggestionCreatesWant): after Suggesting.suggest succeeds, call Wanting.want only if Wanting._wants is false. A duplicate suggestion refuses ALREADY_SUGGESTED and does not alter interest.

A member [withdraws their suggestion](reaction:OnDeck.WithdrawSuggestion) by resolving its group, checking membership, then calling Suggesting.withdraw. This removes only the group association, retaining the activity and all users' wants and experiences. The same activity may be suggested again after withdrawal.

```endpoints
OnDeck.AddToGroup at /activities/add-to-group
OnDeck.WithdrawSuggestion at /activities/withdraw
```

## Group Interest

A member [browses the group collection](reaction:OnDeck.ListActivities). The [group collection](former:OnDeck.GroupCollection) joins Suggesting._forGroup to
ActivityCapturing._get and current group members' Wanting and Experiencing facts. It returns suggestion and activity identities, suggester, details, interested members, and completed members with repeat preferences. Sort by activity name then activity identity. A group with no suggestions returns an empty activities list. Missing wants mean false; missing experiences mean not completed, distinct from unknown repeat preference. Former members' preferences are retained but excluded from group counts and visible member lists.

A member [opens activity details](reaction:OnDeck.GetActivity) with group and activity. The [activity page](former:OnDeck.ActivityPage) shows the saved details, suggestion, and one status row for every current group member, including those with no response. Both reads enforce membership; activity details also require a suggestion in that group.

```endpoints
OnDeck.ListActivities at /activities/list
OnDeck.GetActivity at /activities/get
```

After checking membership and the group's suggestion, a member may [want an activity](reaction:OnDeck.WantActivity) through Wanting.want, [remove their want](reaction:OnDeck.UnwantActivity) through Wanting.unwant, [record completion](reaction:OnDeck.CompleteActivity) through Experiencing.complete, [set repeat preference](reaction:OnDeck.SetRepeatPreference) through Experiencing.setRepeatPreference, or [undo completion](reaction:OnDeck.UndoCompletion) through Experiencing.undoCompletion. Each changes only the requesting user's facts.

```endpoints
OnDeck.WantActivity at /activities/want
OnDeck.UnwantActivity at /activities/unwant
OnDeck.CompleteActivity at /activities/complete
OnDeck.SetRepeatPreference at /activities/repeat-preference
OnDeck.UndoCompletion at /activities/undo-completion
```

[Completion clears a want](reaction:OnDeck.CompletionClearsWant): after a successful Experiencing.complete, call Wanting.unwant only if a want exists.
[Repeat willingness restores interest](reaction:OnDeck.RepeatYesCreatesWant): after setting repeat preference to YES, call Wanting.want only if no want exists.
Changing repeat preference to NO or UNKNOWN leaves current interest unchanged, as in the original reactions. Explicitly wanting a completed item is still permitted and independent of its saved repeat preference. Undoing completion removes history and leaves current interest unchanged. Withdrawal and leaving a group
do not trigger preference changes. Coordinated effects must settle before the response is presented and be safe to resume without duplicating effects.

## Pick for Now

A member [asks for options](reaction:OnDeck.PickForNow), supplying a group, a nonempty set of participating member identities, and optional category, location, maxCost, currency, from, and until filters. The [participant relation](view:OnDeck.ValidParticipants) requires every selected person to be a current member, deduplicates identities, and allows the requester to select a subset without including themselves. No selection refuses NO_PARTICIPANTS; a nonmember participant refuses INVALID_PARTICIPANTS. Invalid date bounds, from later than until, a nonfinite or negative maxCost, an unsupported currency, or supplying only one of maxCost and currency refuse INVALID_FILTERS. No plan or selection is stored.

The [options former](former:OnDeck.PickOptions) starts with the group's suggestions, joins their details and only selected participants' wants and experiences, and returns at most ten activities. Filters combine with AND. Category uses trimmed, case-insensitive exact labels; location uses a trimmed, case-insensitive substring. Blank string filters are omitted. Date bounds are inclusive instants in ISO 8601 with UTC offsets. An active filter excludes an activity missing that field; absent filters do not exclude incomplete details. When maxCost and currency are supplied, include only activities with a known estimated cost per person less than or equal to maxCost in that same currency. Both amounts use the currency’s major unit. Zero cost is free; missing cost is unknown and is excluded by an active budget filter. Do not convert between currencies. Without date filters, past events remain visible.

For each activity, count selected participants who currently want it, who want it and have no completion, who have completed it, and who have completed it with repeat YES. Rank by wanted count descending, then wanted-without-completion count descending, then activity name ascending and activity identity ascending. Include zero-interest activities after interested activities when space remains. Do not silently treat unknown repeat preferences as YES or exclude an activity solely because someone has done it. Return those counts, selected participant status rows, activity details, and suggestion identity, so the group can assess the tradeoff itself. An empty collection or filters matching nothing returns an empty options list. The response also echoes the deduplicated participants and applied filters. Choosing an outing remains a human decision; requesting options never changes wants or records a completion.

```endpoints
OnDeck.PickForNow at /pick/options
```

## Application read calculations

These named calculations implement the access checks and read joins described above. They read concept queries without changing state. Extraction is an optional
host-supplied integration; its failure leaves manual capture available.

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
