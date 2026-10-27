# Local setup reference

Return to the [README](../README.md) for the quick start, project materials, build command, and test commands.

## Configuration

Copy [`.env.example`](../.env.example) to `.env` only on first setup. Bun loads `.env` from the repository root.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URL` | Required application database URL; the example uses local MongoDB with development credentials and database `myapp`. |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Required for real browser sign-in and backend session verification; obtain both from the same Clerk application. |
| `CLERK_AUTHORIZED_PARTIES` | Allowed frontend origins; defaults include `http://127.0.0.1:8080` and `http://localhost:8080`. Update when using another origin. |
| `MONGODB_TEST_URL` | Optional separate MongoDB server for tests; otherwise tests use `MONGODB_URL`. |
| `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_GENAI_MODEL` | Optional Gemini discovery configuration; see below. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Optional private backend secret for environment-only hosting; the complete service-account key JSON, not a file path. |
| `CHROME_PATH` | Optional Chrome executable path for browser tests. |

Clerk sign-in loads its browser UI over the network. Tests use local authentication instead. Keep `.env`, session tokens, and Google credential files out of version control.

## Running and troubleshooting

- `bun run dev` starts MongoDB, backend (3000), and frontend (8080), with server file watching. A working `podman compose` provider is required.
- With MongoDB already running, use `bun run dev:backend` and `bun run dev:frontend` in separate terminals.
- `bun run build` writes the frontend bundle to ignored `dist/`; `bun run preview` starts MongoDB and the non-watching servers with production frontend settings.
- `bun run start` runs without watching, with backend on **4000** and frontend on **8080**. Restart it after code or environment changes. The frontend proxies API requests to that backend.
- If ports 27017, 3000, 4000, or 8080 are occupied, stop the conflicting process or configure matching server/proxy addresses. `HOST`/`PORT` control directly launched servers; `BACKEND_URL` controls the frontend proxy. The start scripts set their own addresses.
- If Podman cannot connect, start its engine/VM and verify `podman compose version`. On a fresh macOS installation, initialize the VM before starting it.
- `bun run db:stop` stops MongoDB without deleting saved data. `bun run db:reset` **deletes the local database volume**.

The [Compose file](../compose.yaml) defines MongoDB only; run the app servers on the host using the commands above.

## Sign-in works but API requests return unauthorized

Check `CLERK_AUTHORIZED_PARTIES` on the **deployed backend**. Its local defaults reject tokens issued for a hosted frontend. For the current deployment, set:

```dotenv
CLERK_AUTHORIZED_PARTIES=https://on-deck.mit-sdg.dev
```

Use the exact frontend origin (scheme and hostname, without a trailing slash). If supporting multiple frontends, separate trusted origins with commas. Do not disable the allowlist. Ensure the frontend publishable key and backend secret key belong to the same Clerk application/instance, restart or redeploy the affected services, then sign out and sign back in. Local `.env` changes do not update deployed settings. If requests still fail, inspect backend verification diagnostics and whether the proxy preserves `Authorization`; do not share cookies or session tokens.

## Optional Gemini discovery

In **Pick for Now**, enter a mood and choose **Find options**. Gemini reranks up to ten filtered saved ideas using activity details and selected participants’ anonymous likes/completions/repeat preferences. Empty prompts use ordinary ranking; missing configuration or provider failures show ordinary options with an explanatory message. Background refresh never calls Gemini.

Set these server-side values in `.env`:

```dotenv
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_MODEL=gemini-3-flash-preview
```

Enable billing and the Vertex AI API (`aiplatform.googleapis.com`) in that project. The default model is a preview; choose another model available to your project if needed.

### Local authentication

For development on your machine, use Application Default Credentials:

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

A local login does not transfer to the deployed backend. On Google Cloud, an attached service account is preferable; an existing credential file can also be referenced through `GOOGLE_APPLICATION_CREDENTIALS` using its path on the server.

### Hosting with environment variables only

1. In [Google Cloud Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts), select your project and create a service account for OnDeck.
2. Grant it **Agent Platform User / Vertex AI User** (`roles/aiplatform.user`) in that project.
3. Open the account’s **Keys → Add key → Create new key → JSON**. Download the file outside your repository. See [Google’s key instructions](https://docs.cloud.google.com/iam/docs/keys-create-delete).
4. Add **`GOOGLE_SERVICE_ACCOUNT_JSON`** as a **private backend environment variable** in your hosting dashboard. Paste the entire JSON object from the file as its value—not a path, base64, or an extra quoted string. Preserve the `\n` escapes inside `private_key`.
5. Keep the project, location, and model variables above. Deploy the code that supports this setting and restart the backend. Test discovery on the deployed app.

If using this JSON in a local `.env` instead, compact it onto **one line and wrap the whole value in single quotes**. Unquoted multiline JSON makes Bun read only the opening `{`. Dashboard values use raw JSON without those outer `.env` quotes.

When set, `GOOGLE_SERVICE_ACCOUNT_JSON` takes precedence over file-based credentials; remove a stale `GOOGLE_APPLICATION_CREDENTIALS` setting if no longer needed. Invalid JSON disables discovery with a safe diagnostic while the rest of the app continues to work.

Never commit the JSON file or its contents, expose it through frontend variables, or paste it into logs/chat. Restart the backend after credential changes. See [Google’s authentication guide](https://docs.cloud.google.com/docs/authentication/application-default-credentials) for other hosting options.

Only explicit submissions send the prompt, candidate details, and anonymous preference signals to Google Cloud; account identities and source URLs are omitted. Generated explanations are tentative, not verified activity facts.

## API examples and extraction

The [API reference](api.md) documents authenticated routes and access rules. The host verifies Clerk sessions and overwrites client-supplied actor IDs.

To run the typed API example, set `CLERK_USER_ID` and a fresh `CLERK_SESSION_TOKEN` locally, then run:

```sh
bun scripts/try-api.ts
# For bun run start:
bun scripts/try-api.ts http://127.0.0.1:4000/api
```

A signed-in browser can obtain a short-lived token with `await window.Clerk.session.getToken()` in its developer console. The example creates persistent demo data; do not share the token.

Automatic link extraction is disabled by default. To enable it, pass an extraction callback to `assembleApplication`; manual entry remains available when extraction is unsupported or fails.

## Testing

`bun test` runs concept, composition, transport, authentication, and frontend tests. The Chrome journey is opt-in:

```sh
ONDECK_BROWSER_TESTS=1 bun test
# Browser journey only:
bun test tests/frontend/Browser.test.ts
```

On macOS, the default executable is `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Elsewhere, set `CHROME_PATH` to a Chrome executable. The browser journey uses temporary profiles, local servers, isolated MongoDB data, and fake authentication/Gemini responses.

To capture a fresh test transcript in a shell supporting `pipefail`:

```sh
set -o pipefail
ONDECK_BROWSER_TESTS=1 bun test 2>&1 | tee /tmp/ondeck-test-results.txt
```

The [recorded validation summary](test-results/README.md) links the timestamped transcript and explains its scope. Rerun the suite to validate a later checkout; local results do not establish deployed-app behavior.
