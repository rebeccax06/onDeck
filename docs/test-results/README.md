# Recorded validation results

Recorded **October 26, 2026 (UTC)** against the working tree identified in the [full execution transcript](bun-test.txt). 


| Check                             | Result                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `bun run check:design`            | Passed                                                                                            |
| `bun run check`                   | Passed: concepts, application diagnostics, generated artifacts, TypeScript, and stylesheet bundle |
| `ONDECK_BROWSER_TESTS=1 bun test` | **78 passed, 0 failed; 537 assertions across 17 files**                                           |




## What the evidence covers


| Area                                                              | Meaningful checks                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Concept behavior](../../tests/concepts/)                         | Main actions and refusals, persistence, concurrent writes, independent personal preferences, exact invite-expiry boundaries, member-only link naming, and concurrent automatic numbering.                                                              |
| [Composition and access](../../tests/compositions/OnDeck.test.ts) | Full sharing/interest/completion/pick journey; private-ID sharing refusal; current-member editing; loss of access after leaving; refused operations preserve relevant state.                                                                           |
| [Incomplete information](../../tests/compositions/OnDeck.test.ts) | Unknown filter details remain eligible and flagged; known mismatches are excluded; unknown cost stays distinct from free; ranking and ten-result limit remain enforced.                                                                                |
| [Discovery](../../tests/auth/Discovery.test.ts)                   | Anonymous selected-person preferences with vague activity names; invented/duplicate candidate rejection; authentication and post-inference membership checks; bounded requests; timeout/provider/invalid-output fallback and content-free diagnostics. |
| [Live integration](../../tests/transport/Live.test.ts)            | Real HTTP/WebSocket updates after settled writes, audience isolation, reconnect behavior, invitation joining, and group deletion/editing.                                                                                                              |
| [Browser journey](../../tests/frontend/Browser.test.ts)           | Actual Vue UI with multiple accounts, backend, MongoDB, and headless Chrome; live updates; partial-share recovery; editing and date roundtrip; invite creation/renaming/revocation; loading state; toast expiry; desktop/mobile discovery cards.       |
| [Client refresh](../../tests/frontend/LiveRefresh.test.ts)        | Delayed responses cannot replace a newer group/account view; invalidation and queued refreshes preserve current state.                                                                                                                                 |




## Scope and limitations

These are **local integration results**, not verification of the deployed service. Tests use isolated MongoDB databases, test-only account identities, and injected Gemini responses; Clerk's real verifier is separately exercised with locally signed fixtures. No live model request is made by this suite, and automated discovery checks do not establish the factual accuracy or quality of generated explanations.

See the [setup/testing guide](../setup.md#testing) to rerun the suite and the [design notebook](../../design-changes.md) for decisions and rationale.