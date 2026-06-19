# Ooznest Control MCP Server

The MCP (Model Context Protocol) server bridges AI assistants and automation tools to your CNC machine or actuator system. It connects to the Ooznest Control backend via WebSocket (`ws://localhost:8081`) and exposes machine control as standardized tools, resources, and prompts.

## Quick Start

```bash
# Ensure the Ooznest Control backend is running (Electron app or node main.js)

# Run the MCP server with default settings (stdio + HTTP)
node mcp-server.js

# With specific transports
node mcp-server.js --transports stdio,http
```

## Transports

### 1. Stdio (for Claude Desktop, VS Code, Cursor, CLI)

Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ooznest-control": {
      "command": "node",
      "args": ["C:/Users/User/Documents/GITHUB/OOZNEST-ENGINEER/ooznest-control/mcp-server.js"],
      "env": {
        "MCP_TRANSPORTS": "stdio"
      }
    }
  }
}
```

VS Code (`.vscode/mcp.json`):

```json
{
  "servers": {
    "ooznest-control": {
      "type": "stdio",
      "command": "node",
      "args": ["mcp-server.js"],
      "env": { "MCP_TRANSPORTS": "stdio" }
    }
  }
}
```

Once connected, ask Claude:
- "What's the machine status?"
- "Send G91 G0 Z10 to the CNC"
- "Home the Z axis"
- "Jog X 10mm at 500 feed"

### 2. HTTP/SSE (for n8n, custom web apps, remote access)

The HTTP server runs on port **3001** by default.

#### SSE Endpoint (for MCP-native clients)

```
GET http://localhost:3001/sse
Authorization: Bearer your-api-key (optional)
```

Connects via Server-Sent Events. Sends `endpoint: /message` for client-to-server communication.

#### n8n Integration

**Option A: MCP Node (n8n 1.80+)**

Add an MCP Client node pointing to `http://localhost:3001/sse`. Tools auto-discover.

**Option B: HTTP Request Nodes (any n8n version)**

Create a workflow with these HTTP Request nodes:

*Check machine status:*
```
GET http://localhost:3001/status
```

*List all available MCP tools:*
```
GET http://localhost:3001/mcp/tools
```

*Call a tool (POST):*
```json
POST http://localhost:3001/mcp/call
Content-Type: application/json
Authorization: Bearer your-api-key

{
  "name": "gcode_send",
  "arguments": {
    "line": "G91 G0 Z10"
  }
}
```

**Example n8n Workflow: "Email me when job completes"**

```
1. Webhook (trigger)         →  Called by your system when job starts
2. HTTP Request (loop)       →  GET http://localhost:3001/status
3. IF (status.Idle)          →  If status is Idle and was previously Running
4. Email                     →  Send notification
```

**Example n8n Workflow: "Generate and run G-code from spreadsheet data"**

```
1. Schedule Trigger          →  Daily at 9am
2. Google Sheets             →  Read cut dimensions from sheet
3. Code (Set)                →  Build G-code string
4. HTTP Request              →  POST /mcp/call { name: "gcode_load", arguments: { content: "..." } }
5. HTTP Request              →  POST /mcp/call { name: "job_run", arguments: {} }
6. HTTP Request (loop)       →  GET /status until job completes
7. Slack                     →  Post completion message
```

#### Health Check

```
GET http://localhost:3001/
GET http://localhost:3001/health
→ { "status": "ok", "connected": true, "machineStatus": "Idle" }
```

### 3. MQTT (for Home Assistant, Node-RED, IoT)

Requires the `mqtt` npm package:

```bash
npm install mqtt
```

Configure in `mcp-config.json`:

```json
{
  "mqttBroker": "mqtt://localhost:1883",
  "mqttTopicPrefix": "ooznest/"
}
```

#### Topics

| Topic | Direction | Payload |
|---|---|---|
| `ooznest/status` | ← | Machine state JSON |
| `ooznest/job/progress` | ← | Job progress JSON |
| `ooznest/job/complete` | ← | Sent once on job finish |
| `ooznest/ina219` | ← | Power monitor data |
| `ooznest/cmd/gcode` | → | `{ "line": "G91 G0 Z10" }` |
| `ooznest/cmd/jog` | → | `{ "x": 10, "feed": 500 }` |
| `ooznest/cmd/actuator` | → | `{ "id": 1, "distance": 50, "feed": 300 }` |
| `ooznest/cmd/job` | → | `{ "action": "pause" \| "resume" \| "stop" }` |

#### Home Assistant Discovery

Add to your `configuration.yaml`:

```yaml
mqtt:
  sensor:
    - name: "Machine Status"
      state_topic: "ooznest/status"
      value_template: "{{ value_json.status }}"
    - name: "Spindle Speed"
      state_topic: "ooznest/status"
      value_template: "{{ value_json.spindle }}"
      unit_of_measurement: "RPM"
    - name: "Job Progress"
      state_topic: "ooznest/job/progress"
      value_template: "{{ value_json.pct }}"
      unit_of_measurement: "%"
    - name: "Power Voltage"
      state_topic: "ooznest/ina219"
      value_template: "{{ value_json.voltage }}"
      unit_of_measurement: "V"
    - name: "Power Current"
      state_topic: "ooznest/ina219"
      value_template: "{{ value_json.current }}"
      unit_of_measurement: "A"
  switch:
    - name: "Spindle Control"
      command_topic: "ooznest/cmd/gcode"
      payload_on: '{"line": "M3 S1000"}'
      payload_off: '{"line": "M5"}'
      state_topic: "ooznest/status"
      value_template: "{{ value_json.spindle > 0 }}"
```

## Configuration

Edit `mcp-config.json`:

```jsonc
{
  "backendUrl": "ws://localhost:8081",    // Backend WebSocket URL
  "transports": ["stdio", "http"],         // Enabled transports
  "httpPort": 3001,                        // HTTP/SSE port
  "mqttBroker": null,                      // MQTT broker URL (null = disabled)
  "mqttTopicPrefix": "ooznest/",           // MQTT topic prefix
  "apiKey": null,                          // API key for HTTP/MQTT auth
  "actuatorMap": {                         // Named actuator configuration
    "1": { "axis": "z", "feed": 500, "limits": [0, 200], "name": "TV Lift" },
    "2": { "axis": "a", "feed": 500, "limits": [0, 500], "name": "Bed Lift" }
  }
}
```

Environment variables override config file values:
- `MCP_TRANSPORTS` — comma-separated list
- `MCP_HTTP_PORT` — HTTP port number
- `MCP_MQTT_BROKER` — MQTT broker URL
- `MCP_API_KEY` — API key for auth

## Available MCP Tools

| Tool | Description | Example |
|---|---|---|
| `gcode_send` | Send any G-code command | `{ "line": "G91 G0 Z10" }` |
| `gcode_load` | Load G-code into buffer | `{ "content": "G21\\nG0 X0 Y0\\n..." }` |
| `job_run` | Start streaming loaded G-code | `{}` |
| `job_pause` | Pause running job | `{}` |
| `job_resume` | Resume paused job | `{}` |
| `job_stop` | Stop and reset | `{}` |
| `axis_home` | Home an axis | `{ "axis": "z" }` |
| `axis_jog` | Relative jog | `{ "x": 10, "y": 5, "feed": 500 }` |
| `axis_move` | Absolute rapid | `{ "x": 50, "y": 30 }` |
| `spindle_set` | Set spindle speed | `{ "speed": 5000, "direction": "cw" }` |
| `spindle_stop` | Stop spindle | `{}` |
| `alarm_unlock` | Clear alarm | `{}` |
| `actuator_move` | Move named actuator | `{ "id": 1, "distance": 50 }` |
| `actuator_stop` | Emergency stop actuator | `{ "id": 1 }` |
| `probe_execute` | Probe cycle | `{ "axis": "z", "direction": -1, "feed": 50 }` |
| `wcs_set_offset` | Set WCS offset | `{ "axis": "z", "value": 0 }` |
| `machine_status` | Full status report | `{}` |

## Available Resources

| URI | Description |
|---|---|
| `machine://status` | Current state, positions, feed, spindle |
| `machine://limits` | Soft limits from grblHAL settings |
| `machine://pins` | Input pin states |
| `machine://ina219` | Voltage and current |
| `job://progress` | Job streaming progress |
| `gcode://content` | Loaded G-code content |
| `actuator://config` | Configured actuator map |

## Prompts

| Prompt | Arguments | Use |
|---|---|---|
| `troubleshoot_alarm` | `code` (required) | Diagnose alarm/error codes |
| `generate_gcode` | `description` (required) | Generate G-code from description |
| `job_report` | — | Formatted job summary |
| `diagnose_connection` | — | Connection troubleshooting |

## Security

- By default, the MCP server listens on `0.0.0.0:3001` — bind to `127.0.0.1` in production if remote access isn't needed
- Set `MCP_API_KEY` to require `Authorization: Bearer <key>` on HTTP endpoints
- Stdio transport is inherently local (no network exposure)
- MQTT authentication uses the API key as password if set

## Architecture

```
┌─────────────────┐     MCP Protocol      ┌──────────────────────┐
│  Claude Desktop  │◄──── stdio ──────────►│                      │
│  VS Code / Cursor│                      │   Ooznest MCP Server  │
└─────────────────┘                       │   (mcp-server.js)     │
                                          │                       │
┌─────────────────┐     HTTP/SSE          │   ┌─────────────────┐ │
│  n8n             │◄─────────────────────►│   │  McpBridge      │ │
│  Web Apps        │                       │   │  connected to   │ │
└─────────────────┘                       │   │  ws://localhost  │ │
                                          │   │  :8081           │ │
┌─────────────────┐     MQTT              │   └────────┬────────┘ │
│  Home Assistant │◄─────────────────────►│            │           │
│  Node-RED       │                       │            │           │
└─────────────────┘                       └────────────┼───────────┘
                                                        │
                                                        ▼
                                              ┌──────────────────┐
                                              │  Ooznest Control  │
                                              │  Backend (main.js)│
                                              │  ws://0.0.0.0:8081│
                                              └────────┬─────────┘
                                                       │
                                              ┌────────▼─────────┐
                                              │   CNC Machine     │
                                              │  (USB/Telnet/WS)  │
                                              └──────────────────┘
```
