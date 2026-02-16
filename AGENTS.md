# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the Vite + React frontend.
- `src/components/` holds reusable UI blocks; `src/pages/` holds route-level screens (including `src/pages/admin/`).
- `src/context/`, `src/utils/`, `src/layouts/`, and `src/lib/` contain shared state, helpers, layout wrappers, and integrations.
- `server/index.js` is the Express API/server entrypoint. Local JSON data lives in `server/data/db.json` (gitignored).
- `public/` stores static assets. `scripts/` contains diagnostics/smoke tooling (`pw_debug.mjs`, `seo_smoke.mjs`).
- `dist/` is generated build output; do not edit it manually.

## Build, Test, and Development Commands
- `npm install`: install dependencies (Node 20.x is expected).
- `npm run dev`: start frontend dev server on `http://localhost:5173`.
- `npm run server`: start backend API on `http://localhost:3000`.
- `npm run build`: produce production frontend build in `dist/`.
- `npm run preview`: preview the built frontend locally.
- `npm run lint`: run ESLint across `js/jsx`.
- `npm run smoke:api`: run API health smoke test against a running server.
- `node scripts/seo_smoke.mjs`: optional SEO/route smoke pass.
- `npm run pw:debug`: optional Playwright-based debug flow.

## Coding Style & Naming Conventions
- Use ES modules and functional React components.
- Naming: `PascalCase` for components/pages/layouts, `camelCase` for utilities/functions, descriptive route file names in `src/pages/`.
- Follow existing style in each file; keep changes consistent with surrounding indentation and semicolon usage.
- Keep Tailwind utility class lists readable (group layout, spacing, color, and effects).
- Run `npm run lint` before committing; ESLint config is in `eslint.config.js`.

## Testing Guidelines
- There is no dedicated unit-test framework configured yet; CI validates `lint`, `build`, server startup, and `smoke:api`.
- Minimum pre-PR local checks:
  1. `npm run lint`
  2. `npm run build`
  3. `npm run server` (separate terminal), then `npm run smoke:api`
- For new automated tests, prefer `*.test.js` naming and keep tests near the feature or under a `tests/` folder.

## Commit & Pull Request Guidelines
- Recent history is mixed (`v1`, `working`, `fix: ...`). For new work, use clear conventional messages such as `feat(admin): add login lockout`.
- Keep commits focused and imperative; include config/env impacts in the commit body when relevant.
- PRs should include:
  - What changed and why
  - Linked issue/task
  - Validation steps run (commands + result)
  - Screenshots/video for UI changes (`src/components`, `src/pages`)

## Security & Configuration Tips
- Copy `.env.example` to `.env`; never commit secrets.
- `.env` and `server/data/db.json` are intentionally ignored.
- Use `DB_PATH` for isolated local debug data when needed.
