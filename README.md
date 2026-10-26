# OnDeck

OnDeck helps friends save activity ideas, share them with groups, and choose what to do together using their interests and repeat preferences. Optional Gemini discovery ranks saved ideas for a mood such as “something chill.”

[Live app](https://on-deck.mit-sdg.dev/)

[P4 demo](https://drive.google.com/file/d/1NUsqf7y-yDeOm3cRbPR1RHT90FIQWzG_/view?usp=sharing)

[Beta demo](https://youtu.be/lOiKlo7TzRc)

[Alpha demo](https://drive.google.com/file/d/1MzA0Gtd-2lBIoQ_Ru9OA5ZyYlzV7R07Q/view?usp=sharing)

[Project materials](#project-materials)

[Local setup](#local-setup) 

[Build and checks](#build-and-checks)

[Tests](#tests)

## Project materials

| Material | Links |
| --- | --- |
| Goals and stakeholders | [Problem framing](problem-framing.md), [application pitch](application-pitch.md) |
| Design and specifications | [Concept overview](concepts.md), [concept specifications](design/concepts/), [types](design/types.md), [composition and reactions](design/compositions/OnDeck.md) |
| Interface and journeys | [UI sketches](ui-sketches.md), [user journey](user-journey.md), [visual design study](https://docs.google.com/presentation/d/1EJIy1UGXG7Z7uk9DXubN1bM-2p0PRY6cemwZzJnPhvw/edit?usp=sharing) |
| Implementation reference | [HTTP API](docs/api.md), [generated design read-back](generated/ondeck.md), [design notebook](design-changes.md) |
| Setup and validation | [Extended setup guide](docs/setup.md), [tests](tests/), [validation results](docs/test-results/README.md) |

## Local setup

Requires **Bun 1.4.2**, **Podman with a Compose provider**, and a **Clerk application** for sign-in. Start the Podman engine first; on macOS, initialize its VM once with `podman machine init`, then use `podman machine start`.

From the repository root:

```sh
bun install --frozen-lockfile
cp .env.example .env  # First setup only; preserve an existing .env.
```

In `.env`, set `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from your Clerk application. Keep the supplied `MONGODB_URL` for the local database and `CLERK_AUTHORIZED_PARTIES` for the local frontend origins. Gemini configuration is optional; see [Google Cloud setup](docs/setup.md#optional-gemini-discovery). Never commit credentials.

```sh
bun run dev
```

This starts MongoDB in Podman and the backend/frontend in watch mode:

- **App:** http://127.0.0.1:8080 — sign up or sign in with Clerk.
- **API:** http://127.0.0.1:3000/api — authenticated POST/JSON endpoints.
- **Health:** http://127.0.0.1:3000/health — checks database connectivity.

Refresh the browser after frontend changes; save unfinished drafts first. Stop the app with Ctrl+C; stop the database with `podman compose stop mongo` (data is retained). See [troubleshooting and alternate commands](docs/setup.md#running-and-troubleshooting).

## Build and checks

Bun bundles the frontend when serving it; the backend runs TypeScript directly. To build browser assets independently:

```sh
bun build web/index.html --target browser --outdir /tmp/ondeck-web-build
```

The output is a frontend bundle; it still needs the backend routes and Clerk configuration. For design and implementation validation:

```sh
bun run check:design
bun run generate
bun run check
```

Change `design/` before implementation. `generate` refreshes the checked-in client types and design read-back; `check` validates concepts, generated artifacts, TypeScript, and CSS.

## Tests

After installing dependencies and creating `.env`, start MongoDB and run:

```sh
bun run db:up
bun test
```

Tests use temporary `ondeck_test_*` databases via `MONGODB_TEST_URL` or `MONGODB_URL` and remove them afterward. Test authentication and Gemini responses are local fakes; real Clerk/Google credentials and billed Gemini calls are not required.

The desktop/mobile browser journey additionally requires **Google Chrome**. Set `CHROME_PATH` if Chrome is not at the default macOS location:

```sh
ONDECK_BROWSER_TESTS=1 bun test
# One suite:
bun test tests/concepts/InviteLinks.test.ts
```

See [recorded validation results](docs/test-results/README.md) for the test summary and full transcript, and [test details](docs/setup.md#testing) to rerun them. Recorded results describe the timestamped local checkout, not deployment verification.
