# ChromaBridge (flux-ui-adapter)

Real-time screenshot capture and replay platform.

A monorepo containing a **WebSocket ingestion server** (Node.js / Fastify / SQLite) and a **Chrome extension** (Manifest V3) that captures periodic screenshots from any web page, streams them to the server, and provides a live session replay viewer.

## Branches

| Branch | Description |
|--------|-------------|
| `main` | Stable -- kept clean |
| `mut_ss_dev` | Mutations + screenshots (legacy) |
| `dev_ss` | **Active development** -- screenshot-only, production-ready |

See the `dev_ss` branch for full source code and setup instructions.
