# OnDeck HTTP API

This reference describes the running HTTP host, including authentication and copyable invitation links. The [composition specification](../design/compositions/OnDeck.md) defines application behavior. [Generated contracts](../generated/wire.ts) describe the assembled endpoints; [OnDeckHttpContract](../src/http-contract.ts) supplements their errors with those produced by the authenticated host and frontend proxy. The Vue client uses this supplemented contract.

## Requests and authentication

All endpoints in the tables below accept **POST** with `Content-Type: application/json` under `/api`. During development, the browser calls the frontend at `http://127.0.0.1:8080/api`, which proxies to the backend on port 3000.

Send `Authorization: Bearer <Clerk session token>`. The backend verifies the session and its authorized frontend origin. Missing or invalid sessions return 401 `UNAUTHORIZED`. The server always supplies the actor from the verified account, overwriting any JSON `user` value. Raw HTTP callers may omit `user`; the generated typed client still requires it. Supplying someone else's ID cannot change the actor. The Clerk secret key stays on the backend.

Bodies must be JSON objects of at most 1 MiB. Unknown fields and incorrect field types are rejected. IDs are strings: group, invitation, capture, activity, suggestion, and account identities. Treat them as identities without interpreting their contents. Every successful endpoint below returns HTTP 200 and the listed JSON object. Empty collections return arrays, not errors.

## Groups and invitations

Inputs below omit the host-supplied `user` field.

| Path after `/api` | Input | Successful response |
| --- | --- | --- |
| `/groups/list` | `{}` | `{book: {groups: [{group, name, members: string[], cover: string | null}]}}` |
| `/groups/create` | `{name}` | `{group}` |
| `/groups/get` | `{group}` | `{page: {group, name, members: [{user}]}}` |
| `/groups/invite` | `{group, invitee}` | `{invitation}` |
| `/groups/leave` | `{group}` | `{success: true}` |
| `/groups/delete` | `{group}` | `{success: true}` |
| `/groups/update` | `{group, name, cover}` | `{success: true}` |
| `/invitations/list` | `{}` | `{inbox: {invitations: [{invitation, group, inviter, name}]}}` |
| `/invitations/accept` | `{invitation}` | `{group}` |
| `/invitations/decline` | `{invitation}` | `{success: true}` |

Group editing requires current membership. `cover` is a PNG/JPEG/WebP base64 data URL of at most 350000 characters, or `null` to remove the picture. The host validates its image signature and encoding; invalid pictures or blank names refuse without changing the stored group. The browser accepts PNG, JPEG, and WebP uploads up to 8 MiB. Its crop editor exports a 960 × 480 JPEG and strips source metadata before saving; raw uploads are not stored. Covers persist with the group in MongoDB and are included only in authorized group-card reads.

Deleting a group requires current membership and removes its membership and all invitation links/inbox entries. Shared activity records and personal preferences are retained; other groups remain accessible. A removed group can no longer be opened or joined, and its former members receive a change notice.

Creating a group makes the caller its first member. All members have equal privileges. Group reads, invitations, and leaving require current membership. Only an invitation's recipient can accept or decline it; a pending invitation does not grant access to group activities. Groups follow the caller’s saved card order, followed by remaining groups sorted by name then ID.

For HTTP `/groups/invite`, `invitee` is an existing Person/account ID. This endpoint creates a direct in-app invitation without an email lookup. The primary interface uses copyable invite links. Leaving retains suggestions, wants, and experiences; even an empty group and its pending invitations remain stored.

## Link invitations and personal order

These are the primary UI invitation routes. The `/groups/invite` route above creates invitations for existing accounts.

| Path after `/api` | Input | Successful response |
| --- | --- | --- |
| `/groups/order` | `{order: string[]}` | `{success: true}` |
| `/groups/create-link` | `{group}` | `{link, token, expires: number}` |
| `/groups/links` | `{group}` | `{book: {links: [{link, expires}]}}` |
| `/groups/revoke-link` | `{group, link}` | `{success: true}` |
| `/invitations/join-link` | `{token}` | `{group}` |

`order` is a distinct list of up to 1000 nonempty group IDs, saved only for the authenticated caller. Unknown or departed IDs never expose a group. Cards include current member IDs for their summaries.

Invite links are reusable until revoked or expired. Creation, listing, and revocation require current membership. Expiry is a Unix timestamp in milliseconds, seven days after creation. Invalid, expired, or revoked tokens return `NOT_FOUND`. Rejoining through a valid link is idempotent. An inviter leaving does not revoke links.

The raw token is returned only on creation; the group stores its hash. Browser invitation URLs use `/#invite=TOKEN`, preserving the invitation through sign-in and removing the fragment after joining. Link summaries contain no raw token.

Authenticated host routes outside `/api`:

| Path | Input | Successful response |
| --- | --- | --- |
| `POST /sharing/preview` | `{token}` | `{name}` |

Previews expose only the group name after authentication, without group contents or member data. Email inbox, delivery, and email acceptance/decline endpoints are removed. No email provider credentials or APP_ORIGIN are required.

## WebSocket updates

`POST /live/ticket` requires a session bearer token and an Origin in `CLERK_AUTHORIZED_PARTIES`; it returns `{ticket}` with no-store caching. A ticket expires in 30 seconds and can be used once for a same-origin WebSocket upgrade at `/live?ticket=...`. The frontend explicitly bridges this upgrade to the backend.

The server sends `{type: "ready"}` on connection and `{type: "changed"}` after a successful coordinated mutation. Notices contain no group data. Clients re-read the existing authorized endpoints, including after reconnect. Heartbeat text `ping` receives `{type: "pong"}`; arbitrary messages close the connection. Connections close after five minutes to require renewed authentication. There are no client-selected subscriptions. Before/after membership determines recipients, and shared preferences invalidate the actor's other current groups too. Read-only endpoints and refused mutations do not emit notices. Sign-out closes the connection. The browser heartbeat detects interrupted connections and retries with backoff. Notifications currently support one backend process; multiple processes require a shared transport.

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
| 401 | `UNAUTHORIZED` | Missing or invalid session. |
| 403 | `FORBIDDEN` | Caller lacks membership, capture ownership, invitation ownership, or withdrawal permission. |
| 404 | `NOT_FOUND` | Requested resource or group/activity association does not exist. |
| 409 | `CONFLICT` | Duplicate membership, invitation, suggestion, or already-applied personal transition. |
| 500 | `INTERNAL_ERROR` | Unexpected server failure. |
| 503 | `UNAVAILABLE` | Invitation provider failure or frontend proxy cannot reach the backend. |

Check `"error" in result` before reading a typed client's success response. Network failures can also reject the client promise; the Vue API layer presents friendly messages for those failures. Unknown groups are checked before group membership. Access checks run on the backend rather than relying on hidden UI.

## Host routes and browser updates

- `GET /auth/people` requires the same bearer token and returns `{names: {[accountId]: displayName}}` for the caller, fellow group members,  and pending inviters only. It accepts no arbitrary ID lookup and exposes no email addresses. It returns 401 `UNAUTHORIZED`, 405 `METHOD_NOT_ALLOWED` for other methods, or 503 `UNAVAILABLE` on provider/storage failures. Missing names receive a short member label; names never grant access.
- `GET /config` is served by the frontend and returns `{clerkPublishableKey}`.  It contains only the public key.
- `GET /health` is public and returns `{status: "ok"}` with 200 when MongoDB  is readable, or `{status: "unavailable"}` with 503. Through the frontend,  an unreachable backend returns 503 `{error: "UNAVAILABLE"}`.

The browser refreshes groups, invitations, membership, activities, open activity details, and previously submitted Pick results after WebSocket change notices, connection/reconnection, or focus return. There is no routine data polling. Events during a read queue another read; events during a mutation wait for it to settle. Background reads preserve unfinished drafts, filter inputs, and participant choices except members who have left. Stale responses from earlier groups/accounts/actions are discarded. Failures retain the last successful view, show an update warning, and retry automatically. Display names refresh separately, normally at most once per minute. Drafts remain in memory and do not survive a page reload.
