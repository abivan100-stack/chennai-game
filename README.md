# Auto Anna 🛺

A browser open-world game set in Mylapore, Chennai. You inherit your uncle's old auto rickshaw: pick up passengers, earn fares, and pay off the auto before the moneylender takes it. The day/night cycle follows real Chennai time (IST).

Built with Vite, TypeScript, three.js and Rapier physics. Runs as a static site.

> Status: early prototype. Walk around Mylapore, get into uncle's auto, accept ride orders on your phone, earn fares and repay the moneylender. Weather is live from Chennai.

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
| F | Get in / out of the auto (out only when nearly stopped) |
| E | Talk to a nearby person; at a hotel / tiffin centre / store: open the menu (1-4 to order) |
| W/A/S/D while eating | Stop eating early |
| E in a supermarket | At a shelf: pick items (1-4) into the basket; at the counter: pay and eat |
| W / S (in the auto) | Accelerate / brake, then reverse |
| A / D (in the auto) | Steer |
| Space (in the auto) | Handbrake |
| P | Phone: ride orders, map, wallet (repay the loan), messages, weather |
| F (near any vehicle) | Get in — if someone is driving it, you steal it (police will come!) |
| 1 | Take out / put away the stick (lathi) |
| Left click | Punch (or swing the lathi when it's out); click again to chain |
| Q | Kick (knocks people down) |
| Right mouse (hold) | Block (less damage) |
| R | Cycle test weather: rain / clear / live (debug) |
| T (hold) | Fast-forward time (debug) |
| M | Mute / unmute sound |
| F3 | Debug panel + quality setting |

## Other scripts
- `npm run typecheck` runs TypeScript only.
- `npm run check` runs a small self-check of the sun-position and quality logic.
- `npm run models` rebuilds the character models in `public/models/` from raw files in `assets-source/` (needs Blender). See CLAUDE.md, "Asset pipeline".

## Credits
Characters by Adobe Mixamo and Quaternius (CC0). Full list in [CREDITS.md](CREDITS.md).
