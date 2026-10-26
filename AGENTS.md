## Running the app

- `bun run dev` starts MongoDB in a container, then the backend at http://127.0.0.1:3000 and the frontend at http://127.0.0.1:8080, both in watch mode.
- `bun run start` runs the host backend on port 4000 and frontend on port 8080 without watching; start MongoDB with `bun run db:up` first. `bun run preview` starts the database and runs these servers with production frontend settings.
- `bun run db:stop` stops MongoDB without deleting data; `bun run db:reset` deletes local database volumes. Stop host servers with Ctrl+C.
- `bun run build` bundles frontend assets into ignored `dist/`; the backend runs TypeScript directly.
- Change `design/` before the code. Check it with `bun run check:design`, then run `bun run generate` and `bun run check`.
