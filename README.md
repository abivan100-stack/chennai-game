# Auto Anna 🛺

A browser open-world game set in Mylapore, Chennai. You inherit your uncle's old auto rickshaw: pick up passengers, earn fares, and pay off the auto before the moneylender takes it. The day/night cycle follows real Chennai time (IST).

Built with Vite, TypeScript, three.js and Rapier physics. Runs as a static site.

> Status: early prototype. Walk around a test town, find the parked auto. Driving comes next.

## Requirements
- Node.js 22.18 or newer (tested on Node 24)
- A browser with WebGL2 (any recent Chrome, Edge, Firefox or Safari)

## Install and run
```bash
npm install
npm run dev
```
Open http://localhost:5173 and click the game to capture the mouse.

## Build
```bash
npm run build     # typecheck + production build into dist/
npm run preview   # serve the built dist/ locally
```
Deploy `dist/` to any static host. On Cloudflare Pages: build command `npm run build`, output directory `dist`.

## Controls
| Key | Action |
|-----|--------|
| Click | Capture mouse (Esc releases it) |
| W A S D | Move |
| Mouse | Look around |
| Shift | Run |
| Space | Jump |
| F | Get in the auto (when close) |
| E | Talk to a nearby person |
| T (hold) | Fast-forward time (debug) |
| F3 | Debug panel + quality setting |

## Other scripts
- `npm run typecheck` runs TypeScript only.
- `npm run check` runs a small self-check of the sun-position and quality logic.
- `npm run models` rebuilds the character models in `public/models/` from raw files in `assets-source/` (needs Blender). See CLAUDE.md, "Asset pipeline".

## Credits
Characters by Adobe Mixamo and Quaternius (CC0). Full list in [CREDITS.md](CREDITS.md).
