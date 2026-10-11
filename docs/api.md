# OnDeck HTTP API

This reference describes the running HTTP host, including authentication and email invitations. The [composition specification](../design/compositions/OnDeck.md) defines application behavior. [Generated contracts](../generated/wire.ts) describe the assembled endpoints; [OnDeckHttpContract](../src/http-contract.ts) supplements their errors with those produced by the authenticated host and frontend proxy. The Vue client uses this supplemented contract.

## Requests and authentication

All endpoints in the tables below accept **POST** with `Content-Type: application/json` under `/api`. During development, the browser calls the frontend at `http://127.0.0.1:8080/api`, which proxies to the backend on port 3000.

Send `Authorization: Bearer <Clerk session token>`. The backend verifies the session and its authorized frontend origin. Missing or invalid sessions return 401 `UNAUTHORIZED`. The server always supplies the actor from the verified account, overwriting any JSON `user` value. Raw HTTP callers may omit `user`; the generated typed client still requires it. Supplying someone else's ID cannot change the actor. The Clerk secret key stays on the backend.

Bodies must be JSON objects of at most 1 MiB. Unknown fields and incorrect field types are rejected. IDs are strings: group, invitation, capture, activity, suggestion, and account identities. Treat them as identities without interpreting their contents. Every successful endpoint below returns HTTP 200 and the listed JSON object. Empty collections return arrays, not errors.

## Groups and invitations

Inputs below omit the host-supplied `user` field.

| Path after `/api` | Input | Successful response |
| --- | --- | --- |
| `/groups/list` | `{}` | `{book: {groups: [{group, name}]}}` |
| `/groups/create` | `{name}` | `{group}` |
| `/groups/get` | `{group}` | `{page: {group, name, members: [{user}]}}` |
| `/groups/invite` | `{group, invitee}` | `{invitation}` |
| `/groups/leave` | `{group}` | `{success: true}` |
| `/invitations/list` | `{}` | `{inbox: {invitations: [{invitation, group, inviter, name}]}}` |
| `/invitations/accept` | `{invitation}` | `{group}` |
| `/invitations/decline` | `{invitation}` | `{success: true}` |

Creating a group makes the caller its first member. All members have equal privileges. Group reads, invitations, and leaving require current membership. Only an invitation's recipient can accept or decline it; a pending invitation does not grant access to group activities. Groups are listed by name then ID.

For HTTP `/groups/invite`, **`invitee` is an email address**, despite the internal composition using an account ID with the same string type. The host checks the caller's group access before resolving an exact verified email on an existing Clerk account. Friends must register first. Invitations appear inside OnDeck; this endpoint does not send email. Leaving retains suggestions, wants, and experiences; even an empty group and its pending invitations remain stored.

## Captures and sharing

| Path after `/api` | Input | Successful response |
| --- | --- | --- |
| `/captures/start` | `{source}` | `{capture}` |
| `/captures/get` | `{capture}` | `{preview: {capture: {capture, owner, source, proposal}}}` |
| `/captures/confirm` | `{capture, name, ...details}` | `{activity}` |
| `/captures/discard` | `{capture}` | `{success: true}` |
| `/activities/add-to-group` | `{group, activity}` | `{suggestion}` |
| `/activities/withdraw` | `{suggestion}` | `{success: true}` |

`source` for starting a capture is a nonblank URL or description. Only the owner can read, confirm, or discard a pending capture. `proposal` is either `null` or proposed activity fields. Extraction is optional and disabled in the default assembly; users can enter details manually. Confirmation consumes the capture and creates an activity, without sharing it yet.

Optional `details` fields are `source`, `description`, `location`, `category`, `cost`, `currency`, and `dateTime`. Text fields are strings. `name` must be nonblank. Cost is a finite nonnegative number in the currency's major unit per person; zero means free. Supply cost and supported currency together (for example, `cost: 15, currency: "USD"`). An omitted cost is unknown. `dateTime` is an ISO 8601 instant with a timezone offset, such as `2026-10-12T18:00:00-04:00`. Optional fields may be omitted or supplied as `null`.

Adding requires membership and an existing activity. Sharing in multiple groups uses separate requests; retain the confirmed activity ID when retrying a failed share. A successful suggestion records the suggester's interest if absent. Duplicate suggestions conflict. Only the suggester, while a current member, can withdraw a suggestion. Withdrawal retains the activity and personal facts.

## Activities and personal preferences

| Path after `/api` | Input | Successful response |
| --- | --- | --- |
| `/activities/list` | `{group}` | `{book: {activities: Activity[]}}` |
| `/activities/get` | `{group, activity}` | `{page: {activity: Activity}}` |
| `/activities/want` | `{group, activity}` | `{success: true}` |
| `/activities/unwant` | `{group, activity}` | `{success: true}` |
| `/activities/complete` | `{group, activity}` | `{experience}` |
| `/activities/repeat-preference` | `{group, activity, preference}` | `{success: true}` |
| `/activities/undo-completion` | `{group, activity}` | `{success: true}` |

These requests require current membership. Requests targeting one activity also require that activity to be suggested in the specified group. Writes affect only the caller's preferences. Wants and experiences refer to the same activity across groups; suggestions belong to individual groups.

An `Activity` contains `activity`, `suggestion`, `suggester`, `name`, the optional details above, and:

- `members`: `{user, wanted: boolean, completed: boolean, repeatPreference}` for
  every current member. `repeatPreference` is `"YES"`, `"NO"`, or `"UNKNOWN"`
  for completed activities, and `null` when not completed.
- `interestedMembers`: an array of interested account IDs.
- `completedMembers`: an array of `{user, repeatPreference}`.

Activities are ordered by name then activity ID. Former members' personal facts remain stored but are excluded from the group's current member rows and counts.

Completion clears the caller's heart. Setting repeat preference to `"YES"` restores it, `"NO"` clears it, and `"UNKNOWN"` leaves it unchanged. Setting a repeat preference requires a completion. Undoing completion leaves interest unchanged. A user may explicitly heart a completed activity independently of their saved repeat preference. Repeating an already-applied want, unwant, completion, or undo-completion may return `CONFLICT`.

## Pick for Now

`POST /api/pick/options` accepts `{group, participants, category?, location?, maxCost?, currency?, from?, until?}`. `participants` is a nonempty array of current group member IDs; duplicates are removed. The caller must be a member but need not include themselves. Optional filters may be omitted or `null`.

The response is `{book: {result: {options, participants, filters}}}`. Each option has the Activity fields, participant-only member rows and counts, plus `wantedCount`, `wantedWithoutCompletionCount`, `completedCount`, and `repeatYesCount`. The response echoes deduplicated participants and applied filters.

Filters combine with AND: category matches a trimmed, case-insensitive exact label; location matches a trimmed, case-insensitive substring. Budget requires both nonnegative `maxCost` and supported `currency`, excluding unknown costs and other currencies without conversion. Date bounds are inclusive timezone-bearing instants, with `from` no later than `until`. Missing activity fields exclude it only when the corresponding filter is active. Blank category/location filters are omitted.

At most ten options are ranked by wanted count descending, then wanted without completion descending, then name and ID ascending. Zero-interest options can appear after interested options. No matches returns an empty list. This read does not store a plan, change interest, or record completion.

## Errors

Errors have the form `{error: "CODE"}`. The HTTP host and policy expose these categories rather than internal concept refusal messages:

| HTTP status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Malformed body, invalid shape, or invalid names, details, preferences, participants, or filters. |
| 400 | `INVALID_EMAIL` | Invitation email has an invalid format. |
| 401 | `UNAUTHORIZED` | Missing or invalid session. |
| 403 | `FORBIDDEN` | Caller lacks membership, capture ownership, invitation ownership, or withdrawal permission. |
| 404 | `NOT_FOUND` | Requested resource or group/activity association does not exist. |
| 404 | `FRIEND_NOT_FOUND` | No existing account has that verified email. |
| 409 | `CONFLICT` | Duplicate membership, invitation, suggestion, or already-applied personal transition. |
| 500 | `INTERNAL_ERROR` | Unexpected server failure. |
| 503 | `UNAVAILABLE` | Invitation provider failure or frontend proxy cannot reach the backend. |

Check `"error" in result` before reading a typed client's success response. Network failures can also reject the client promise; the Vue API layer presents friendly messages for those failures. Unknown groups are checked before group membership. Access checks run on the backend rather than relying on hidden UI.

## Host routes and browser updates

- `GET /auth/people` requires the same bearer token and returns `{names: {[accountId]: displayName}}` for the caller, fellow group members,  and pending inviters only. It accepts no arbitrary ID lookup and exposes no email addresses. It returns 401 `UNAUTHORIZED`, 405 `METHOD_NOT_ALLOWED` for other methods, or 503 `UNAVAILABLE` on provider/storage failures. Missing names receive a short member label; names never grant access.
- `GET /config` is served by the frontend and returns `{clerkPublishableKey}`.  It contains only the public key.
- `GET /health` is public and returns `{status: "ok"}` with 200 when MongoDB  is readable, or `{status: "unavailable"}` with 503. Through the frontend,  an unreachable backend returns 503 `{error: "UNAVAILABLE"}`.

The visible Vue page polls groups, invitations, membership, and activities every three seconds and on focus return. It also updates open activity details and previously submitted Pick results. Background reads preserve unfinished drafts, filter inputs, and participant choices except members who have left. Stale reads from earlier groups/accounts/actions are discarded. Failures retain the last successful view, show an update warning, and retry automatically. Display names refresh separately, normally at most once per minute. This is periodic polling; updates are not instantaneous. Drafts remain in memory and do not survive a page reload. 
