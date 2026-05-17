# Ooznest Control

[![Cross-Platform Builds](https://github.com/ooznest/ooznest-control/actions/workflows/cross-platform-builds.yml/badge.svg)](https://github.com/ooznest/ooznest-control/actions/workflows/cross-platform-builds.yml)
[![GitHub Pages](https://github.com/ooznest/ooznest-control/actions/workflows/pages/pages-build-deployment/badge.svg)](https://github.com/ooznest/ooznest-control/actions/workflows/pages/pages-build-deployment)

A modern, cross-platform control interface for **grblHAL CNC controllers** — primarily designed for the **Ooznest WorkBee Z2+** running the **Ooznest Motion Control Core**.

## Downloads

- [Download Latest Release binaries (Windows, macOS, Linux, Android, iOS)](https://github.com/ooznest/ooznest-control/releases/latest)
- [Run pure Web Version (Live GitHub Pages)](https://ooznest.github.io/ooznest-control/)

## Hardware Support

| Machine | Controller | Connection |
|---|---|---|
| Ooznest WorkBee Z2+ | Ooznest Motion Control Core (ESP32, grblHAL) | Web Serial, WebSocket, Telnet |
| Any grblHAL machine | Any grblHAL board (ESP32, STM32, etc.) | Web Serial, WebSocket, Telnet |

Ooznest-specific board detection: automatically detects Ooznest Core from `$I+` output and applies custom spindle labels (Spindle Analog VFD10V, Laser, RS485 VFD).

## Features

### Machine Control
- **DRO (Digital Read Out)** — Real-time position, feed rate, spindle speed, WCS state for X, Y, Z, A axes. Machine coordinates and work coordinates displayed simultaneously.
- **Jogging** — Full D-pad jog with axis-colored buttons (X=red, Y=green, Z=blue, A=orange). Configurable step sizes and feed rates.
- **Homing** — Per-axis homing buttons. Homing directory mask ($23) respected for 3D viewer envelope.
- **Spindle Control** — Start/stop/direction with RPM override. Multi-spindle support (PWM, PWM2, VFD) with Ooznest-specific labeling.
- **Feed Override** — Real-time feed rate override (100% default).
- **Rapid Override** — Real-time rapid override (100% default).
- **Alarm Unlock** — $X unlock with confirmation.
- **Reset** — Soft reset (\x18) with confirmation.

### 3D G-Code Viewer
- Hardware-accelerated OpenGL rendering via Three.js
- Orbit, pan, zoom, and perspective/orthographic camera toggle
- Feed (primary theme) and rapid (axis-x color) path visualization with directional lighting
- Machine box, WCS origin marker, and grid overlay
- Job stats panel with segment length distribution chart
- **Tool visibility toggles** — Checkboxes for each tool usage in G-code order; show/hide specific tool paths
- Envelope overlap detection — segments exceeding machine soft limits colored red
- Job progress visualization — completed segments dimmed
- STL model loading

### G-Code Editor
- Full-featured code editor with syntax highlighting (Monaco editor)
- Line count, file name display
- G-code loading from local file or SD card
- G-code sync with backend

### Job Runner
- Stream G-code to controller line-by-line with `ok`/`error:` handshake
- Pause/Resume/Stop controls with progress overlay (bar + percentage + elapsed time)
- Job duration estimate and total distance tracking
- SD card job detection auto-switches UI

### Tool Management & Manual Tool Change (MTC)
- **Tool Table** — View, edit, save, and delete tool entries via `G10 L1`. Columns: Tool ID, Z-Offset, Diameter. Active tool highlighted green, selected tool blue.
- **Manual Tool Change (M6)** — Automatic modal appears when controller enters "Tool" state. Shows current/next tool info.
- **TLO Measurement** — Built-in tool length offset workflow inside the MTC modal:
  - **Set Ref** — Records current machine Z as baseline (first tool)
  - **Measure** — Probes/jogs new tool and computes offset from previous tool; applies `G43.1 Z{offset}`
  - **Reset** — Clears TLO state and cancels offset
  - Supports users with or without a tool length sensor (probe or manual jog)
- **grblHAL helpers** — `$TLR` (Set Length Ref) and `$TPW` (Probe Workpiece) buttons in MTC modal
- **Job streamer MTC integration** — Stream pauses on `error:40` (tool change pending) and auto-resumes after MTC completes

### Probing
- XYZ touch plate probing with configurable distance and feed rate
- Tool Length Offset (TLO) — reference and measure routines against a fixed tool setter
- Probe mode selection: probe (`G65P5Q0`), TLS (`G65P5Q1`), secondary probe (`G65P5Q2`)

### Calibration Wizard
- Vernier-style axis calibration for steps/mm ($100, $101)
- Cut 100 marks spaced 0.9mm, measure alignment, auto-calculate new steps/mm

### Surfacing Wizard
- Automated G-code generator for fly-cutter facing operations
- Configurable width, depth, stepover, and tool diameter

### Macros
- User-definable G-code macros with custom names
- Run from the Macros tab with one click

### SD Card Management
- Browse, upload, and execute files directly from the controller's SD card
- Progress tracking for SD card jobs

### Troubleshooting
- **Signals** — Real-time input pin states in 4-column grid (X-Limit, Block Delete, Single Step, etc.)
- **Power Supply** — INA219 voltage/current monitoring with dual-axis Chart.js chart (22-26V, 0-5A)
- **Spindles** — Per-spindle controls with enable/disable and speed override; capability tags
- **RGB LED** — Color picker with custom swatches; generates `M150` command syntax

### Settings
- Full grblHAL settings browser ($EG, $ES, $$)
- Two-column layout with grouped settings and inline editing
- Descriptions loaded from controller at runtime

### Firmware Update
- Flash ESP32-based controllers (Ooznest Core) via Web Serial using esptool-js
- Bootloader, partition, and firmware binary selection
- Progress bar, terminal output, success/error modals
- Platform detection (browser vs Electron vs Cordova)

### Connection
- **Web Serial API** — Browser and Electron 25+
- **WebSocket** — grblHAL WiFi/ethernet modules
- **Cordova** — Mobile apps via cordovarduino plugin
- **MCP Protocol Server** — AI/automation bridge (see [MCP_README.md](MCP_README.md))

### AI / Automation Bridge (MCP Server)
- Model Context Protocol (MCP) server with stdio, HTTP/SSE, and MQTT transports
- 17 tools: `gcode_send`, `job_run/pause/resume/stop`, `axis_home/jog/move`, `spindle_set/stop`, `alarm_unlock`, `actuator_move/stop`, `probe_execute`, `wcs_set_offset`, `machine_status`
- 7 resources: machine status, limits, pins, INA219 power, job progress, G-code content, actuator config
- 4 prompts: troubleshoot alarms, generate G-code, job reports, diagnose connection
- Integrates with Claude Desktop, n8n, Home Assistant, custom web apps
- See [MCP_README.md](MCP_README.md) for full documentation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Ooznest Control App                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │  3D View  │ │  Editor  │ │  Macros  │ │  Surfacing   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │  SD Card  │ │  Tools   │ │ Settings │ │Troubleshooting│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────┐ ┌────────────────────────────────────────┐    │
│  │  Probe   │ │        Firmware Update (esptool-js)     │    │
│  └──────────┘ └────────────────────────────────────────┘    │
│                          │                                  │
│           ┌──────────────┴──────────────┐                   │
│           │     Connection Manager      │                   │
│           │  Serial / WebSocket / Telnet │                   │
│           └──────────────┬──────────────┘                   │
└──────────────────────────┼──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │  Electron Backend       │
              │  (main.js)              │
              │  ws://0.0.0.0:8081      │
              └────────────┬────────────┘
                           │
              ┌────────────┴────────────┐
              │  CNC Machine            │
              │  (grblHAL on ESP32)     │
              │  USB / WiFi / Ethernet  │
              └─────────────────────────┘
```

## Quick Start

### Web Version
Open https://ooznest.github.io/ooznest-control/ in Chrome, Edge, or Opera. Connect via Web Serial.

### Desktop Version
Download the latest release for your platform from the [Releases page](https://github.com/ooznest/ooznest-control/releases/latest).

### Development
```bash
git clone https://github.com/ooznest/ooznest-control.git
cd ooznest-control
npm install
npm start    # Electron desktop app
```

The web version can be served locally:
```bash
npx serve .
```

## Tech Stack

- **Frontend**: Three.js, Chart.js, Monaco Editor, Tailwind CSS
- **Desktop**: Electron (auto-update via electron-updater)
- **Mobile**: Apache Cordova (Android, iOS)
- **Controller Protocol**: grblHAL v1.1+ serial protocol
- **Backend**: Node.js, Express, WebSocket (ws)
- **AI Bridge**: Model Context Protocol (MCP)
