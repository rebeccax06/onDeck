# OnDeck
A website to help you and your friends keep track of the things you want to do

[Problem Framing and Stakeholders](./problem-framing.md)
[Application Pitch](./application-pitch.md)
[Concept specifications, essential reactions, and concept roles](./concepts.md)
[UI Sketches](./ui-sketches.md)
[User Journey](./user-journey.md)

## Application design

[Concept designs](./design/concepts/)
[application types](./design/types.md)
[OnDeck composition and endpoints](./design/compositions/OnDeck.md) specify the app before implementation.
The [HTTP API reference](./docs/api.md) documents every endpoint, authentication, request and response shapes, access controls, and public errors.
Validate the design independently with `bun run check:design`. After implementation, `bun run check` also checks that the code and generated artifacts agree with the design.

# Demo
[P2: Alpha](./demo/p2-demo.mp4)

# Design Notebook 
[design notebook](https://github.com/rebeccax06/61040-assignments/blob/main/design-notebook.md)

## Run the API

Install dependencies with `bun install`. Copy `.env.example` to `.env` if you do not already have one. The example connects to the local MongoDB container using the development credentials from `compose.yaml` and the database named `myapp`.

Start MongoDB and the backend:

```sh
bun run db:up
bun run dev:backend
```

The API listens at `http://127.0.0.1:3000/api` by default; `HOST` and `PORT` can override the address. `GET /health` returns 200 when MongoDB is readable and 503
when it is unavailable. Requests to the app's endpoints use POST and JSON:

```sh
curl http://127.0.0.1:3000/api/groups/create \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CLERK_SESSION_TOKEN" \
  -d '{"name":"Roommates"}'
```

The server requires a verified Clerk session. The `user` field remains in the generated endpoint contract, but the server always replaces it with the signed-in account ID.

To try the typed API client, set `CLERK_USER_ID` to your account ID and `CLERK_SESSION_TOKEN` to a current session token in your local environment. A signed-in browser can obtain a token with `await window.Clerk.session.getToken()` in its developer console. Tokens expire quickly; obtain a fresh one if needed.
Do not commit or share tokens. Then run:

```sh
bun scripts/try-api.ts
```

This creates a demo group and activity that remain in MongoDB. To use another backend address, pass it as an argument, for example `bun scripts/try-api.ts http://127.0.0.1:4000/api`.

If another MongoDB container already uses port 27017, stop that container before starting this project's MongoDB, or configure a different local port.

Link extraction is optional and disabled by default. Pass an extraction callback to `assembleApplication` to provide it. Manual capture works without an extractor, and unsupported links or extraction failures leave the capture available for editing.

Each `.registry.ts` module connects a class to its unchanged concept specification and refusal codes; the suffix is a naming convention. After changing implementation or composition declarations, run `bun run generate` and `bun run check` to regenerate and validate the design read-back and client types in `generated/`.

## Run the Vue frontend

With MongoDB available, run both development servers:

```sh
bun run dev
```

Open http://127.0.0.1:8080. If MongoDB is already running and you do not need `db:up`, run `bun run dev:backend` and `bun run dev:frontend` in separate terminals.
The frontend proxies `/api`, `/auth/people`, and `/health` to the backend on port 3000. `BACKEND_URL` overrides that backend address.

For the user journey:

1. Sign in, create Roommates, and invite friends by email. Friends must first  create an OnDeck account and verify that email. Invitations appear in the app;
   this does not send an email. They accept from their own accounts.
2. Open Add activity, paste a source, review or manually enter the details, and select the groups to share with. Saving automatically turns on your heart.
3. Sign in as another group member to browse the group's On Deck and open an activity. Toggle its heart, record that you have done it, or set whether you would go again.
4. Open Pick for Now, select the people present, and optionally filter by category, location, numeric budget/currency, or dates. Open a ranked option to see details.

Clerk handles authentication. Drafts stay in memory while this page is open; finish sharing before reloading. If sharing fails after saving, retry with the same saved activity. Link extraction remains disabled by default, so manual entry is expected. While visible, the page checks for other users' changes every three seconds and when focus returns, preserving unfinished input. Failed updates show a warning and retry automatically. These updates still need a final two-account browser walkthrough.

The frontend is in `web/index.html`, `web/app.ts`, and `web/styles.css`, with authentication in `web/useAuth.ts`, API error handling in `web/api.ts`, refresh coordination in `web/live-refresh.ts`, and reusable activity cards in `web/components/ActivityCard.ts`. `web/server.ts` serves and bundles it with Bun. Vue uses its full browser build for the HTML template, without a separate Vite server. `bun run check` includes frontend TypeScript. `bun run start` runs both servers, with the backend on internal
port 4000 and the frontend on port 8080 (or the supplied `PORT`).

## Tests

With MongoDB running, use `bun test` to run the concept and composition suites. Tests use `MONGODB_TEST_URL`, falling back to `MONGODB_URL` from `.env`. Each suite or test creates a unique `ondeck_test_*` database and drops it afterward; it does not clear the configured application database.

The concept and composition tests cover all five concepts, including their main flows, refusal cases, query ordering and empty results, persistence, repeated transitions, and concurrent writes. Composition tests cover the core journey, reactions, ranking and filtering, and endpoint failures. Authentication HTTP tests verify that the host supplies identity. `tests/auth/Clerk.test.ts` uses local signing keys and Clerk’s real verifier to test valid sessions, missing and malformed tokens, expiry, origin restrictions, and signature tampering without calling Clerk or requiring real API keys.

Each concept has its own suite in `tests/concepts/<ConceptName>.test.ts`.
Run one suite with, for example, `bun test tests/concepts/Wanting.test.ts`.
