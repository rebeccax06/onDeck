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

[P2 Alpha](https://drive.google.com/file/d/1MzA0Gtd-2lBIoQ_Ru9OA5ZyYlzV7R07Q/view?usp=sharing)

# Design Notebook

[Design changes](./design-changes.md) · [Completion plan](./design/completion-plan.md)

# Visual Design Study
[Visual Design Study](https://docs.google.com/presentation/d/1EJIy1UGXG7Z7uk9DXubN1bM-2p0PRY6cemwZzJnPhvw/edit?usp=sharing)

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

Each `.registry.ts` module connects a class to its concept specification and refusal codes; the suffix is a naming convention. After changing implementation or composition declarations, run `bun run generate` and `bun run check` to regenerate and validate the design read-back and client types in `generated/`.

## Run the app

The frontend uses Vue 3 for its interface and Bun to serve and bundle the files in `web/`. There is no separate Vite project or frontend package to install.

After installing dependencies and copying `.env.example` to `.env`, set `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_AUTHORIZED_PARTIES`. Use your frontend URL for `CLERK_AUTHORIZED_PARTIES`; the example includes both local development URLs.

```sh
bun run dev
```

This starts MongoDB, the backend at `http://127.0.0.1:3000`, and the frontend at [http://127.0.0.1:8080](http://127.0.0.1:8080). If MongoDB is already running, you can run `bun run dev:backend` and `bun run dev:frontend` in separate terminals instead.

Refresh the browser after frontend code changes. Saved group updates appear automatically. Unfinished activity drafts stay in memory, so save them before refreshing.

Invite friends with **Groups → Members → Copy invite link** and share the copied link yourself. No email provider setup is needed.

## Tests

With MongoDB running, use `bun test` to run the concept and composition suites. Tests use `MONGODB_TEST_URL`, falling back to `MONGODB_URL` from `.env`. Each suite or test creates a unique `ondeck_test_*` database and drops it afterward; it does not clear the configured application database.

The concept and composition tests cover all six concepts, including their main flows, refusal cases, query ordering and empty results, persistence, repeated transitions, and concurrent writes. Composition tests cover the core journey, reactions, ranking and filtering, and endpoint failures. Authentication HTTP tests verify that the host supplies identity. `tests/auth/Clerk.test.ts` uses local signing keys and Clerk’s real verifier to test valid sessions, missing and malformed tokens, expiry, origin restrictions, and signature tampering without calling Clerk or requiring real API keys.

Each concept has its own suite in `tests/concepts/<ConceptName>.test.ts`.
Run one suite with, for example, `bun test tests/concepts/Wanting.test.ts`.