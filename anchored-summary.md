# Ooznest Control — Session Summary

## Project
Single-page CNC control UI (`index.html` + `index.css` + `index.js`). No bundler. Three.js G-code viewer in `js/`.

---

## What Was Done This Session

### 1. Toast notifications
- Added `showToast(message, type)` — inline implementation (no UI framework)
- Triggers: Reset machine, Unlock machine, Save Settings
- Toast auto-dismisses after ~3s

### 2. A-Axis DRO row
- `wpos` initialised as `[]` instead of `[0,0,0,0]`
- DRO table loops over `wpos.length` so 3-axis machines get 3 rows, 4-axis gets 4 rows

### 3. Unlock button state
- Disabled + greyed (`opacity-40`, `pointer-events-none`) when not in alarm state
- Uses `$("#unlock-btn").prop("disabled", true/false)`

### 4. Burger menu hidden on desktop
- Added `md:hidden` class to the burger button

### 5. Nav scroll arrows hidden on desktop
- Added `md-hidden` CSS class + `md:hidden` to prev/next arrow buttons

### 6. Logo removed
- Removed Ooznest logo SVG from top bar
- Deleted `logo-ooznest.svg` and `logo-ooznest-white.svg` files

### 7. TOOLS button/panel removed from 3D view
- Removed TOOLS button overlay + dropdown panel from viewer
- Removed `parseToolSegments`, `toggleToolSegment`, `tool-vis-update` event from `3dview.js`

### 8. Stats card close + reopen
- Removed toggle button at top
- Added close X button (stats-card-close)
- Added reopen pill button that slides in/out at bottom of viewer area
- Pill uses transition for show/hide

### 9. Laser auto-detect
- Removed standalone "Laser Mode" button
- Viewer auto-switches wireframe/flat based on `$32` value + active spindle 'L' cap
- `updateLaserMode()` called on status refresh and override dial change

### 10. Consistent instruction paragraphs
- Added `text-xs text-grey leading-relaxed` instruction text to:
  - **Edge & Corners** — describes outside/inside corners + edge finding
  - **TLO** — workflow description (replaced blue info card)
  - **Surfacing** — spindle tram + Z zero info (replaced yellow warning box)
  - **Spoilboard Grid** — engraving description (replaced Notes box)

### 11. Configuration wizard overlay
- Direct child of `<body>`, z-index 100, `isolate`
- Collects Machine (5 fields) + Z-Axis (4 fields)

---

## Not Changed
- Probe tab left as-is
- All existing logic, styling conventions preserved
