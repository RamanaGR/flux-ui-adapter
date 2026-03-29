# ChromaBridge

> Monorepo containing the **ChromaBridge Server** (real-time WebSocket ingestion) and the **ChromaBridge Extension** (Manifest V3 Chrome extension for DOM/Canvas data streaming).

---

## Table of Contents

- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [1. Clone and Install](#1-clone-and-install)
  - [2. Configure the Server](#2-configure-the-server)
  - [3. Start the Server](#3-start-the-server)
  - [4. Build the Extension](#4-build-the-extension)
  - [5. Load the Extension in Chrome](#5-load-the-extension-in-chrome)
- [Server Reference](#server-reference)
  - [HTTP Endpoints](#http-endpoints)
  - [WebSocket Protocol](#websocket-protocol)
  - [Message Envelope Format](#message-envelope-format)
  - [Binary Canvas Protocol](#binary-canvas-protocol)
  - [Session Replay](#session-replay)
  - [Heartbeat and Timeout](#heartbeat-and-timeout)
  - [Compression](#compression)
  - [Buffer-and-Flush Strategy](#buffer-and-flush-strategy)
- [Extension Reference](#extension-reference)
  - [Content Script](#content-script)
  - [Background Service Worker](#background-service-worker)
  - [WebSocketManager](#websocketmanager)
  - [Reconnect Strategy](#reconnect-strategy)
  - [Offline Message Queue](#offline-message-queue)
- [Testing](#testing)
  - [Automated Tests](#automated-tests)
  - [Manual Test Client](#manual-test-client)
- [Environment Variables](#environment-variables)
- [Tech Stack](#tech-stack)
- [Scripts Reference](#scripts-reference)

---

## Architecture

```
┌──────────────────┐         WS + X-API-Key         ┌──────────────────────────────┐
│                  │ ──────────────────────────────▶  │         Fastify Server       │
│  Chrome Extension│                                  │                              │
│  (Manifest V3)   │  ◀── TYPE_UI_CONFIG (theme) ──  │  ┌────────┐  ┌───────────┐  │
│                  │                                  │  │ Decomp │→│ Zod Valid │  │
│  ┌────────────┐  │                                  │  └────────┘  └─────┬─────┘  │
│  │Content     │  │                                  │                    │         │
│  │Script      │──┤                                  │         ┌──────────▼───────┐ │
│  │(Observer)  │  │                                  │         │  Message Router  │ │
│  └────────────┘  │                                  │         └──┬─────────┬─────┘ │
│  ┌────────────┐  │                                  │   DOM Mut  │         │Canvas │
│  │Background  │  │                                  │  ┌────────▼──┐ ┌────▼─────┐ │
│  │Service     │  │                                  │  │  SQLite   │ │File Store│ │
│  │Worker      │  │                                  │  │  (WAL)    │ │ (disk)   │ │
│  │(WS Manager)│  │                                  │  └─────┬─────┘ └────┬─────┘ │
│  └────────────┘  │                                  │        └─────┬──────┘       │
└──────────────────┘                                  │         Flush Worker        │
                                                      │        (long-term store)    │
       Browser visits GET /                           └──────────────────────────────┘
       ──────────────────────▶  ChromaBridge Docs page
```

---

## Repository Layout

```
flux-ui-adapter/
├── package.json                     # Root workspace config
├── .gitignore
├── README.md
│
├── server/                          # ChromaBridge ingestion server
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── .env.example
│   ├── public/
│   │   └── index.html               # "ChromaBridge API Docs" landing page
│   ├── scripts/
│   │   └── test-client.ts           # Manual WS test client
│   ├── src/
│   │   ├── server.ts                # Entry point (start + shutdown)
│   │   ├── app.ts                   # Fastify composition (routes, WS, DB)
│   │   ├── config.ts                # Env-driven configuration
│   │   ├── lib/
│   │   │   └── logger.ts            # Pino structured logger
│   │   ├── schemas/
│   │   │   └── messages.ts          # Zod schemas + binary header parser
│   │   ├── middleware/
│   │   │   ├── decompress.ts        # Gzip / raw deflate auto-detect
│   │   │   └── validate.ts          # Zod envelope + payload validation
│   │   ├── ws/
│   │   │   ├── upgrade.ts           # WS upgrade with X-API-Key auth
│   │   │   ├── connection.ts        # Per-session lifecycle
│   │   │   ├── router.ts            # TYPE_DOM_MUTATION / CANVAS / HEARTBEAT
│   │   │   └── heartbeat.ts         # Ping/pong with 30s timeout
│   │   ├── handlers/
│   │   │   ├── dom-mutation.handler.ts
│   │   │   └── canvas-snapshot.handler.ts
│   │   ├── storage/
│   │   │   ├── sqlite.ts            # better-sqlite3 (WAL mode)
│   │   │   ├── file-store.ts        # Canvas snapshot disk writer
│   │   │   └── flush-worker.ts      # Periodic flush to long-term storage
│   │   └── routes/
│   │       ├── health.ts            # GET /health
│   │       ├── landing.ts           # GET / (static ChromaBridge docs)
│   │       └── session-view.ts      # GET /session/:id/view (replay)
│   └── tests/
│       ├── unit/
│       │   ├── message-parser.test.ts
│       │   └── router.test.ts
│       └── integration/
│           ├── ws-handshake.test.ts
│           └── ws-ingestion.test.ts
│
└── extension/                       # ChromaBridge Chrome extension
    ├── manifest.json                # Manifest V3
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── background.ts            # Service worker (WS bridge)
        ├── content.ts               # MutationObserver + DOM serializer
        ├── ws-manager.ts            # WebSocket with reconnect + queue
        └── types.ts                 # Shared message type definitions
```

---

## Prerequisites

- **Node.js** v20+ (LTS recommended)
- **npm** v10+
- **Google Chrome** (for loading the unpacked extension)

---

## Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/RamanaGR/flux-ui-adapter.git
cd flux-ui-adapter

# Install all workspace dependencies (server + extension)
npm install --workspaces
```

Or install each workspace individually:

```bash
cd server && npm install && cd ..
cd extension && npm install && cd ..
```

### 2. Configure the Server

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and set a strong `API_KEY`:

```
API_KEY=your-secret-api-key-here
```

All other defaults work for local development. See [Environment Variables](#environment-variables) for the full list.

### 3. Start the Server

```bash
cd server

# Development (hot-reload via tsx)
npm run dev

# Production
npm run build
npm start
```

The server starts on `http://localhost:3000` by default.

- Visit `http://localhost:3000` in a browser to see the ChromaBridge documentation page.
- `http://localhost:3000/health` returns a JSON health check.

### 4. Build the Extension

```bash
cd extension
npm run build
```

This produces bundled JS files in `extension/dist/`. Use `npm run watch` for auto-rebuild during development.

### 5. Load the Extension in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` directory (the folder containing `manifest.json`)
5. The extension will activate and begin observing DOM mutations on all pages

Make sure the server is running and the `apiKey` in `chrome.storage.local` matches your server's `API_KEY`. On first install, the extension uses the default key from `background.ts`.

---

## Server Reference

### HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | ChromaBridge documentation page (static HTML) |
| `GET` | `/health` | Health check: `{ status, uptime, activeConnections, db }` |
| `GET` | `/session/:sessionId/view` | Visual replay of stored DOM mutations |

### WebSocket Protocol

**Upgrade path:** `ws://localhost:3000` (any path -- upgrade is handled at the HTTP level)

**Required headers:**

| Header | Description |
|--------|-------------|
| `X-API-Key` | Must match the server's `API_KEY` env variable |
| `X-Session-Id` | *(optional)* Client-provided UUID. Server generates one if absent |

Connections without a valid `X-API-Key` receive `401 Unauthorized` and the socket is destroyed.

### Message Envelope Format

All JSON messages follow the same envelope:

```json
{
  "type": "TYPE_DOM_MUTATION | TYPE_CANVAS_SNAPSHOT | TYPE_HEARTBEAT",
  "sessionId": "uuid-v4",
  "timestamp": 1711234567890,
  "compressed": false,
  "payload": { }
}
```

**DOM Mutation payload:**

```json
{
  "url": "https://example.com/page",
  "mutations": [
    {
      "target": "body > div.content",
      "type": "childList",
      "addedNodes": ["<div>...</div>"],
      "removedNodes": [],
      "attributeName": null,
      "oldValue": null,
      "newValue": null
    }
  ]
}
```

**Heartbeat payload:**

```json
{
  "tabActive": true,
  "memoryUsage": 52428800
}
```

**Server-to-client (UI Config):**

```json
{
  "type": "TYPE_UI_CONFIG",
  "theme": { "primary": "#7c3aed" },
  "translations": {},
  "settings": {}
}
```

### Binary Canvas Protocol

Canvas snapshots use a compact binary header to avoid JSON overhead:

| Offset | Size | Content |
|--------|------|---------|
| 0 | 2 bytes | Type tag: `0x0001` (uint16 LE) |
| 2 | 36 bytes | Session UUID (ASCII) |
| 38 | 8 bytes | Timestamp (float64 LE) |
| 46 | 4 bytes | Sequence number (uint32 LE) |
| 50 | 1 byte | Compressed flag (0 or 1) |
| 51+ | variable | Raw image data (WebP/JPEG/PNG) |

### Session Replay

Navigate to `http://localhost:3000/session/<sessionId>/view` to see a visual timeline replay of all DOM mutations for that session. The page includes:

- A sidebar timeline with clickable mutation entries
- Play / Pause / Reset controls
- A speed slider (50ms to 2000ms per mutation)
- Live DOM injection into a white-background replay container

### Heartbeat and Timeout

- Server pings each connection every **15 seconds**
- If no pong is received within **30 seconds**, the connection is terminated
- The session is marked `COMPLETE` in SQLite and all file streams are flushed

### Compression

The server auto-detects the compression format of incoming data:

- **Gzip** (magic bytes `0x1F 0x8B`): decompressed via `zlib.gunzipSync`
- **Raw deflate**: decompressed via `zlib.inflateRawSync`
- **Uncompressed JSON**: passed through directly

The extension uses `fflate.gzipSync()` for all outbound payloads and sets `compressed: true` in the envelope. The test client sends uncompressed JSON for simplicity.

### Buffer-and-Flush Strategy

1. DOM mutations are written synchronously to **SQLite (WAL mode)** (~50k inserts/sec)
2. Canvas snapshots are written to **disk** at `data/snapshots/{sessionId}/{seq}.{ext}`
3. A **flush worker** runs every 60 seconds (configurable), reads completed sessions, and uploads them to a pluggable `LongTermStore` interface (S3/GCS -- stubbed by default)
4. Flushed sessions are marked as archived

---

## Extension Reference

### Content Script

The content script (`content.ts`) attaches a `MutationObserver` to `document.body` with full subtree observation:

- Mutations are batched for **1 second** before being flushed
- Each `MutationRecord` is serialized with CSS path targets
- Batches are sent to the background service worker via `chrome.runtime.sendMessage()`

### Background Service Worker

The background script (`background.ts`):

- Reads config (API key, session ID, server URL) from `chrome.storage.local`
- Instantiates a `WebSocketManager` connected to the server
- Relays `DOM_MUTATIONS` messages from content scripts to the server
- Sends heartbeat pings every 20 seconds
- Forwards `TYPE_UI_CONFIG` responses from the server to active tabs

### WebSocketManager

The `WebSocketManager` class handles the full lifecycle:

- **Connect** with configurable URL, API key, and session ID
- **Gzip compress** all outbound payloads using `fflate`
- **Reconnect** automatically on disconnection (see below)
- **Queue** messages when offline (see below)

### Reconnect Strategy

Exponential backoff with jitter:

| Attempt | Delay |
|---------|-------|
| 1 | 1s |
| 2 | 2s |
| 3 | 4s |
| 4 | 8s |
| 5 | 16s |
| 6+ | 30s (cap) |

The delay resets to 1 second on successful reconnection.

### Offline Message Queue

- When the WebSocket is not connected, outgoing messages are buffered in memory
- Maximum queue size: **10 messages** (FIFO -- oldest dropped when full)
- On reconnection, all queued messages are flushed immediately before new messages are sent

---

## Testing

### Automated Tests

Run from the `server/` directory:

```bash
cd server

# Run all tests (36 total)
npm test

# Watch mode
npm run test:watch
```

**Test breakdown:**

| Suite | Tests | What it covers |
|-------|-------|----------------|
| `message-parser.test.ts` | 17 | Zod schema validation, binary header parsing, deflate + gzip decompression |
| `router.test.ts` | 6 | Message routing to correct handlers, sequence counters |
| `ws-handshake.test.ts` | 6 | API key auth (reject/accept), custom session ID, HTTP endpoints (health + landing) |
| `ws-ingestion.test.ts` | 7 | DOM mutation persistence, sequence numbering, canvas snapshot storage, heartbeat, error handling, session replay view |

### Manual Test Client

A standalone WebSocket client for quick smoke testing:

```bash
cd server
npm run test:client
```

This connects to `ws://localhost:3000`, authenticates with the default API key, and sends a mock `TYPE_DOM_MUTATION` every 2 seconds. Server responses are logged to the console. Press `Ctrl+C` to disconnect.

Override defaults via environment variables:

```bash
SERVER_URL=ws://your-server:3000 API_KEY=your-key npm run test:client
```

---

## Environment Variables

All server configuration lives in `server/.env` (copy from `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development` enables pino-pretty logging |
| `PORT` | `3000` | HTTP/WS listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `API_KEY` | `change-me-to-a-secure-random-string` | Required for WebSocket authentication |
| `DB_PATH` | `./data/flux.db` | SQLite database file path |
| `SNAPSHOTS_DIR` | `./data/snapshots` | Canvas snapshot storage directory |
| `FLUSH_INTERVAL_MS` | `60000` | Flush worker interval (ms) |
| `HEARTBEAT_INTERVAL_MS` | `15000` | Server ping interval (ms) |
| `HEARTBEAT_TIMEOUT_MS` | `30000` | Pong timeout before disconnect (ms) |
| `LOG_LEVEL` | `info` | Pino log level |

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js v20+ | WebSocket + HTTP server |
| Framework | Fastify v5 | High-performance HTTP, schema validation |
| WebSocket | ws v8 | Minimal-overhead raw WS |
| Database | SQLite (better-sqlite3, WAL mode) | Zero-latency synchronous writes |
| Validation | Zod | Runtime schema validation for all messages |
| Logging | Pino | Structured JSON logging |
| Compression | Node zlib (server) / fflate (extension) | Gzip for payload compression |
| Extension | Chrome Manifest V3 | Content script + service worker |
| Bundler | esbuild | Extension TS to JS bundling |
| Testing | Vitest | Unit + integration tests |
| Dev runner | tsx | TypeScript execution with watch mode |

---

## Scripts Reference

### Root

```bash
npm install --workspaces    # Install all dependencies
```

### Server (`cd server`)

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `tsx watch src/server.ts` | Start with hot-reload |
| `build` | `tsc` | Compile TypeScript to dist/ |
| `start` | `node dist/server.js` | Run compiled production build |
| `test` | `vitest run` | Run all 36 tests |
| `test:watch` | `vitest` | Tests in watch mode |
| `test:client` | `tsx scripts/test-client.ts` | Manual WS test client |
| `lint` | `tsc --noEmit` | Type-check without emitting |

### Extension (`cd extension`)

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `esbuild ... --bundle --outdir=dist` | Bundle for Chrome |
| `watch` | `esbuild ... --watch` | Auto-rebuild on change |
| `typecheck` | `tsc --noEmit` | Type-check without emitting |
