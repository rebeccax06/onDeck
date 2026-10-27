# OnDeck

OnDeck helps friends save activity ideas, share preferences, and choose something to do together. It combines MembershipTracking, GroupOrdering, ActivityCapturing, Suggesting, Wanting, and Experiencing.

Incomplete ideas remain useful: a $10 budget excludes a known $15 activity but keeps an unknown price with a reminder to check it. Unknown does not mean free or confirmed suitable. Discovery can use shared interest when details are vague, but cannot invent facts.

## Identity and access

The HTTP host authenticates the caller and overwrites user; missing/invalid authentication returns UNAUTHORIZED. Internal actions, queries, formers, and computations are not public routes.

Group access checks existence before membership (NO_SUCH_GROUP, then NOT_A_MEMBER). [MemberMayAccessGroup](view:OnDeck.MemberMayAccessGroup) requires membership; [MemberMayAccessActivity](view:OnDeck.MemberMayAccessActivity) also requires a suggestion in that group. Capture access requires ownership. Invitation recipients and suggestion authors control their respective actions. Refusals preserve state.

Coordination reactions use the successful action’s user and item, never another client-selected actor. Failed actions trigger no coordinated effects. Personal preferences follow the person/activity across groups.

## Groups and invitations

[ListGroups](reaction:OnDeck.ListGroups) returns [GroupList](former:OnDeck.GroupList): current groups, covers, members, and personal order through groupCards. [SaveGroupOrder](reaction:OnDeck.SaveGroupOrder) saves that order; remaining groups follow by name then identity. Saved IDs grant no access.

[CreateGroup](reaction:OnDeck.CreateGroup) makes the caller the first member. [GetGroup](reaction:OnDeck.GetGroup) returns [GroupPage](former:OnDeck.GroupPage). [Invite](reaction:OnDeck.Invite) invites an existing Person. [LeaveGroup](reaction:OnDeck.LeaveGroup) preserves activities, preferences, and pending invitations; members have equal privileges and empty groups remain stored.

[ListInvitations](reaction:OnDeck.ListInvitations) returns [InvitationInbox](former:OnDeck.InvitationInbox) with group names. Only the recipient can [accept](reaction:OnDeck.AcceptInvitation) or [decline](reaction:OnDeck.DeclineInvitation); acceptance returns the joined group.

[UpdateGroup](reaction:OnDeck.UpdateGroup) changes name/cover for a current member. [DeleteGroup](reaction:OnDeck.DeleteGroup) atomically removes the group and invitations, retaining activities and personal preferences. Deleted-group suggestions become inaccessible and saved ordering ignores the group.

### Invite links

[CreateInviteLink](reaction:OnDeck.CreateInviteLink), [ListInviteLinks](reaction:OnDeck.ListInviteLinks), [RenameInviteLink](reaction:OnDeck.RenameInviteLink), [RevokeInviteLink](reaction:OnDeck.RevokeInviteLink), and [JoinInviteLink](reaction:OnDeck.JoinInviteLink) use MembershipTracking. Management requires membership. [InviteLinks](former:OnDeck.InviteLinks) exposes name, identity, and expiry without tokens. Links are reusable until expired/revoked; joining is idempotent and the inviter leaving does not revoke them. Authenticated previews show only the group name; dismissing one does not revoke it.

New links receive sequential group-local names, allocated atomically and not reused after revocation. Rename accepts 1–80 trimmed characters, permits duplicates, and preserves URL/expiry. The UI shows expiry, optional technical details, and a spaced Just copied badge. Copy link again reuses the session URL; Create new link preserves older links. Full URLs are not stored for later copying, and revoking another link preserves the current copyable URL.

## Capture and sharing

[StartCapture](reaction:OnDeck.StartCapture) saves a URL/description. [CaptureStartedProposesDetails](reaction:OnDeck.CaptureStartedProposesDetails) optionally proposes extracted details after successful start; failure leaves manual entry available and consumed captures ignore late proposals.

[GetCapture](reaction:OnDeck.GetCapture) returns [CapturePreview](former:OnDeck.CapturePreview), combining source and proposal. The owner may [confirm](reaction:OnDeck.ConfirmCapture) edited details or [discard](reaction:OnDeck.DiscardCapture). Confirmation creates an activity without sharing or interest.

[AddToGroup](reaction:OnDeck.AddToGroup) checks destination membership, activity existence, then creator ownership or access through another current member group; otherwise it refuses ACTIVITY_NOT_ACCESSIBLE. Knowing an ID grants no sharing rights. An activity without retained creator information requires current group access.

Sharing uses separate requests per group. Retain the confirmed activity and successful shares on failure; remove unavailable targets after membership changes and let the user choose replacements. [SuggestionCreatesWant](reaction:OnDeck.SuggestionCreatesWant) adds missing interest after successful sharing. Duplicate suggestions refuse ALREADY_SUGGESTED without changing interest. [WithdrawSuggestion](reaction:OnDeck.WithdrawSuggestion) requires current membership and authorship, removing only that group association.

## Activity details and preferences

[ListActivities](reaction:OnDeck.ListActivities) returns [GroupCollection](former:OnDeck.GroupCollection), joining suggestions, details, and current-member preferences in activity-name/identity order. [GetActivity](reaction:OnDeck.GetActivity) returns [ActivityPage](former:OnDeck.ActivityPage) with a status row per current member. Former members are excluded; absent wants mean false and absent experiences mean not completed.

After group/activity access checks, [WantActivity](reaction:OnDeck.WantActivity), [UnwantActivity](reaction:OnDeck.UnwantActivity), [CompleteActivity](reaction:OnDeck.CompleteActivity), [SetRepeatPreference](reaction:OnDeck.SetRepeatPreference), and [UndoCompletion](reaction:OnDeck.UndoCompletion) invoke Wanting/Experiencing for the caller.

[CompletionClearsWant](reaction:OnDeck.CompletionClearsWant) clears existing interest. [RepeatYesCreatesWant](reaction:OnDeck.RepeatYesCreatesWant) creates missing interest; [RepeatNoClearsWant](reaction:OnDeck.RepeatNoClearsWant) clears it. UNKNOWN and undo leave interest unchanged; explicit wants remain independent. Effects settle before response and can resume without duplication.

[UpdateActivity](reaction:OnDeck.UpdateActivity) lets any current member edit an activity suggested in that group. Updates replace details across every sharing group, preserving identity, creator, suggestions, and preferences. Refusals change nothing; concurrent edits use the last successful write.

Edit activity sits inside the information card and opens a dedicated form without interest controls. Explain shared-edit scope, preserve failed-save drafts, and restore focus on Save/Cancel. Use a local date/time picker with timezone context; convert changed dates to instants and preserve untouched ones. Blank dates remain absent. Currency defaults to USD unless saved; omit both price fields when cost is blank. Sparse details omit empty fact rows and show “Details not added yet.”

## Pick for Now

[PickForNow](reaction:OnDeck.PickForNow) and [ValidParticipants](view:OnDeck.ValidParticipants) require a nonempty, deduplicated subset of current members; the caller need not participate. Refusals are NO_PARTICIPANTS, INVALID_PARTICIPANTS, and INVALID_FILTERS.

[PickOptions](former:OnDeck.PickOptions) joins group suggestions with selected participants’ preferences. Filters combine with AND:

- Category: trimmed case-insensitive exact match; location: trimmed case-insensitive substring. Blank filters are omitted.
- Budget: finite nonnegative maxCost plus supported currency; compare known costs without currency conversion.
- Dates: inclusive timezone-bearing instants; invalid/reversed bounds refuse INVALID_FILTERS.

Missing/blank activity fields remain eligible; known mismatches are excluded. unknownFilters identifies active filters with missing details (Category, Location, Cost, Date) for users to check.

Return up to ten options by wanted count descending, wanted-without-completion count descending, then name/identity ascending. Include participant statuses, want/completion/repeat-YES counts, and applied filters. Completed and zero-interest activities remain eligible; no matches returns an empty list without writes. Responsive result cards group known facts, interest, tentative explanations, and missing-detail warnings.

### Optional discovery

A nonblank mood prompt explicitly submitted through POST /discovery/options asks server-side Gemini to rerank the authorized shortlist. Empty prompts use normal ranking. AI cannot create activities, change facts, or alter preferences; background refresh preserves order without calling AI.

The host supplies identity, limits prompts to 500 characters and bodies to 8 KiB, obtains candidates through PickForNow, and rechecks membership after inference. Send only candidate details and selected participants’ anonymous, consistent person slots—not names, account IDs, or source URLs. Validate response IDs, reject invented/duplicate entries, and append omitted candidates in normal order.

Balance mood with shared wants and repeat preferences. Unmarked wants, missing preferences, completion alone, and UNKNOWN are neutral; repeat NO is negative rather than a veto. Vague details should increase uncertainty, not erase explicit shared interest. Explanations remain tentative and never fill saved fields.

Missing configuration, blocked/invalid responses, provider errors, and timeouts fall back to normal options with a clear status. Credentials stay server-side ([setup](../../docs/setup.md#optional-gemini-discovery)); gemini-3-flash-preview is configurable. Use low thinking effort for Gemini 3, a 28-second SDK timeout, 30-second ranking deadline, and 45-second browser deadline. Log only failure classification, numeric HTTP status, duration, and candidate count; never prompt/content/credentials or raw provider messages.

## Feedback and live views

Successful writes notify affected members, the actor, and direct invitees after coordinated effects settle. Notices contain no group data; clients reread authorized views. Membership changes notify old/current members, reconnect refreshes, and background reads preserve drafts and reject stale account/group responses.

While picking, hide old results, disable duplicate submission, mark the form busy, and show an accessible, reduced-motion-friendly spinner/status near the button. Discovery says “Gemini is finding ideas…”; ordinary picking says “Finding options…”. Clear pending state on success or failure.

Success uses a dismissible, politely announced bottom toast that expires after four seconds without shifting content. New actions clear it and newer successes reset its timer. Errors and recovery warnings remain visible.

## Endpoint declarations

```endpoints
OnDeck.ListGroups at /groups/list
OnDeck.CreateGroup at /groups/create
OnDeck.GetGroup at /groups/get
OnDeck.Invite at /groups/invite
OnDeck.LeaveGroup at /groups/leave
OnDeck.ListInvitations at /invitations/list
OnDeck.AcceptInvitation at /invitations/accept
OnDeck.DeclineInvitation at /invitations/decline
OnDeck.StartCapture at /captures/start
OnDeck.GetCapture at /captures/get
OnDeck.ConfirmCapture at /captures/confirm
OnDeck.DiscardCapture at /captures/discard
OnDeck.AddToGroup at /activities/add-to-group
OnDeck.WithdrawSuggestion at /activities/withdraw
OnDeck.ListActivities at /activities/list
OnDeck.GetActivity at /activities/get
OnDeck.WantActivity at /activities/want
OnDeck.UnwantActivity at /activities/unwant
OnDeck.CompleteActivity at /activities/complete
OnDeck.SetRepeatPreference at /activities/repeat-preference
OnDeck.UndoCompletion at /activities/undo-completion
OnDeck.PickForNow at /pick/options
OnDeck.SaveGroupOrder at /groups/order
OnDeck.CreateInviteLink at /groups/create-link
OnDeck.ListInviteLinks at /groups/links
OnDeck.RevokeInviteLink at /groups/revoke-link
OnDeck.JoinInviteLink at /invitations/join-link
OnDeck.UpdateGroup at /groups/update
OnDeck.DeleteGroup at /groups/delete
OnDeck.UpdateActivity at /activities/update
OnDeck.RenameInviteLink at /groups/rename-link
```

## Read calculations

These computations query concepts without changing state.

```computations
groupAccessError(user: String, group: String) : String | null
  Returns NO_SUCH_GROUP, NOT_A_MEMBER, or null in that precedence order.
activityAccessError(user: String, group: String, activity: String) : String | null
  Checks group access, activity existence, and the group's suggestion in that order.
addAccessError(user: String, group: String, activity: String) : String | null
  Checks destination group access and activity existence, then requires creator ownership or a suggestion in a current member group; otherwise returns ACTIVITY_NOT_ACCESSIBLE.
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
groupCards(user: String) : Json
  Returns only current member groups, their member IDs, covers, and personal saved ordering;
  groups absent from the saved order follow by name then identity.
```

## Supporting material

See the [API reference](../../docs/api.md), [user journey](../../user-journey.md), [design notebook](../../design-changes.md), and [recorded validation](../../docs/test-results/README.md). Tests cover filtering uncertainty, access, coordination, and the browser journey; local results do not establish deployment availability or AI accuracy. Frontend checks include CSS bundling; remove complete obsolete style rules when changing UI.

Local run commands start application servers on the host with MongoDB in Compose. Build/check/test instructions must work from the lockfile and example configuration; Clerk credentials are required only for real sign-in, and Google Cloud discovery is optional.

For hosts with environment variables only, GOOGLE_SERVICE_ACCOUNT_JSON can supply service-account credentials directly to the server SDK. It takes precedence over file-based ADC when set; malformed credentials disable discovery with a safe diagnostic instead of preventing the app from starting.
