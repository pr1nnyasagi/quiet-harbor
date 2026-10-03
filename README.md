# Salpakan — Game of the Generals

A new interface for the classic Filipino game: a dark strategy table, sage and brass pieces, a private-room lobby, and an uncluttered command center. Two friends play online without accounts.

## Features

- Private six-character room codes and invite links.
- 21-piece armies on the official 9 × 8 board, with arbitrary formations in three home rows.
- Click a piece and a square to rearrange or swap; shuffle and reset formations.
- Server validates deployment, turns, movement, and challenges.
- Enemy ranks and deployment are concealed; IDs are random and do not encode rank.
- Full officer hierarchy, spy/private exceptions, equal-rank elimination, moving flags, flag capture, and far-edge victory with the one-turn survival rule.
- Per-tab reconnect tokens, presence indicators, and paused movement while a player reconnects.
- Draw offers, resignation, battle log, final rank reveal, and mutual rematches with alternating first turns.
- Responsive desktop/mobile layouts and a keyboard-accessible rules dialog.

## Local development

Requires Node.js 22.12+ (Node 24 also works).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The single development server serves both Vite and Socket.IO. To play both seats locally, use two separate tabs **opened independently** or two different browsers. Browser tab duplication may copy the reconnect token; the server refuses concurrent connections using the same seat.

```sh
npm run lint
npm run typecheck
npm test
npm run build
NODE_ENV=production npm start
```

The production entry point serves the built frontend and the game server on one port. `PORT` defaults to 3000. No database or API key is required. Environment variables can be passed by your host; for local overrides use `node --env-file=.env.local --import tsx server/index.ts` with a file you create privately.

## GitHub and hosting

**GitHub stores the source code. GitHub Pages can serve the interface, but cannot run the multiplayer server.** Both players must connect to the same running backend. This project supports two deployments:

### Option A — One Render service (simplest)

1. Upload this project to your GitHub repository.
2. In [Render](https://dashboard.render.com/), choose **New → Blueprint** and select the repository. `render.yaml` defines one Node web service.
3. Approve the deployment. Render builds with `npm ci --include=dev && npm run build` and starts with `npm start`.
4. Share the resulting HTTPS service URL with your friend. It serves both the interface and multiplayer.

Render's free service may sleep when idle. The first connection can take time to wake it. For predictable availability, choose an always-on plan. This repository does not provision paid resources automatically.

### Option B — GitHub Pages frontend + Render backend

1. Deploy the Render service as above.
2. In the Render service settings, set `ALLOWED_ORIGIN=https://YOUR_USERNAME.github.io` (the origin, **without** a repository path). Restart the service. Comma-separated origins are supported.
3. In the GitHub repository settings, open **Pages**, then set **Source → GitHub Actions**.
4. Under **Actions**, manually run **Publish frontend to GitHub Pages**, supplying your backend's HTTPS URL as `backend_url`.
5. The workflow builds the frontend with `VITE_SERVER_URL` and publishes it to your repository's Pages URL. Share that URL.

The build uses relative asset paths so project Pages URLs work. Room invitations use query parameters, avoiding SPA route rewrites. Changing the backend URL requires rebuilding the frontend. The Pages workflow deliberately runs only on manual request; pushes run quality checks without publishing anything.

## Rules and references

Rules follow [Wikipedia's Game of the Generals description](https://en.wikipedia.org/wiki/Game_of_the_Generals), including all five general ranks and mobile flags. The creator of a new room takes the first move; rematches alternate the first player. Both players may agree to a draw. No clocks or automatic repetition draws are imposed.

The [gab-cat/games-of-the-generals](https://github.com/gab-cat/games-of-the-generals) project was reviewed as a reference. Salpakan's application code, interface, and game engine were written independently; no code or artwork was copied from it.

## Architecture and limits

React + TypeScript + Vite for the interface; Express + Socket.IO for the authoritative backend. Zod validates incoming messages. The server sends each player a filtered view of the board rather than sending both armies to the browser. Player names are rendered as text. Reconnect tokens are never included in room broadcasts and are stored in session storage, not in invitation links.

Rooms are in memory on **one server instance**. They expire after four hours without room activity; a server restart or redeployment clears them. This is an MVP for friendly matches, not durable ranked play. Reconnecting from another device is not supported, and an unconfirmed formation resets on refresh. Persistent match storage and multi-instance coordination would require a database/shared store.

The server limits message sizes, action frequency, connection bursts, and room count. Invitation codes authorize joining the second seat; keep them private. During active play, surviving enemy ranks remain secret. When the match ends, surviving ranks are revealed.

The page uses Google Fonts for DM Sans and Manrope, with local sans-serif fallbacks and Georgia for headings. There are no paid assets or external image dependencies.

## Tests

`tests/game.test.ts` checks army composition, legal deployment, movement rejection, rank masking, combat, and both victory conditions. `tests/multiplayer.test.ts` uses real Socket.IO clients against an ephemeral HTTP server to verify room access, payload validation, secrecy, turn synchronization, reconnection, draws, resignation, and rematches. GitHub Actions runs lint, type checks, tests, and a production build.

## License

MIT; see `LICENSE`. Game of the Generals was invented by Sofronio H. Pasola Jr. This is an independent digital adaptation, with no affiliation implied.
