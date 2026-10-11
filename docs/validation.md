# P2 validation

## What I checked

The tests cover all five concepts, including their main flows, invalid inputs, permissions, repeated actions, and concurrent writes. Composition tests check the journey from creating a group and accepting an invitation to sharing an activity, expressing interest, recording completion, and finding options through Pick for Now. Authentication tests check token verification, identity spoofing, and access to private data. Database tests create data through actions or endpoints in temporary MongoDB databases and remove those databases afterward.

| Check | Recorded result |
| --- | --- |
| Full test suite | 51 passed, 0 failed on October 11, 2026. |
| Template tests added afterward | Both passed. |
| `bun run check` | Passed, with 21 advisories. |

## Catching outdated updates

Automatic updates introduce a less obvious risk: a request starts in group A, the user switches to group B, and A’s response arrives last. Without a guard, the page could show the wrong group or restore an old heart count after a newer action.

The refresh controller uses a version number to discard outdated responses. The regression tests deliberately finish requests out of order and assert that the newer view stays intact. They also check that failed updates preserve the last successful view and that a later update recovers. These checks make the timing problem reproducible without relying on slow networks or arbitrary waits. 

## Checking the shared journey

An integration test uses two authenticated test identities, the typed HTTP client, the real HTTP handler, Vue reactivity, and MongoDB. It checks that another member’s heart appears after an update and remains stored when a new application instance reads it. It also verifies that supplying someone else’s ID cannot change the caller’s identity, and that leaving a group removes access without deleting personal preferences.

After recording my demo, I also checked the running app with two signed-in accounts. Changes appeared in the other account’s interface without refreshing, and unfinished input was preserved. This supplements the demo, which shows the same journey before automatic updates were added.

## A failure found afterward

Formatting the HTML split quoted Vue expressions across lines, causing a browser compilation error. I repaired the expressions and added formatting guards. Two new tests compile the actual page and activity-card templates to catch invalid render JavaScript before it reaches the browser. Both pass, and the original multiline-string error was reproduced separately to confirm the diagnosis.

## Limits

The automated cross-user test calls the HTTP handler directly and uses controlled authentication; it does not test live Clerk sign-in or mount the full page. Clerk token verification is tested separately, and the browser walkthrough covers the visible updates and unfinished input. These results establish local behavior, not deployment readiness. The full suite result above predates the two template tests; those tests were run separately afterward.
