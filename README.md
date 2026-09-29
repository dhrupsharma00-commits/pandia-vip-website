# PANDIA VIP OWNER — website version

This package keeps the original HTML UI and Flexi V8 prediction engine, while moving
the upstream result collection to a server-side collector.

## What changed

- Original `public/index.html` UI/prediction logic is preserved.
- The browser now requests `/api/latest` instead of directly requesting the upstream API.
- `server.js` continuously collects upstream WinGo 1M results.
- Results are persisted in `data/results.json` (up to 9999 records).
- Collection continues while the Node server is running, even when the browser is closed.
- `/api/history`, `/api/stats`, and `/api/health` are included.

## Run locally

Requires Node.js 18+.

```bash
npm install
npm start
```

Then open:

http://localhost:3000

## Deploy

Deploy the whole folder to a Node.js host that supports a continuously running process.
Set the `PORT` environment variable if your host provides one.

Important: a static-only host (plain GitHub Pages-style hosting) cannot run `server.js`
continuously. Use a persistent Node/server service for the collector.

## Important limitation

The server collector stores the actual result/period history independently of the browser.
The existing prediction engine itself still executes in the browser because its original
logic is in `index.html`. Therefore, if you need predictions to be generated and stored
even when no browser is open, that engine must also be moved into the server worker.
