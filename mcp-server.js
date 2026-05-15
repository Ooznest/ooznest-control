#!/usr/bin/env node
/**
 * Ooznest Control MCP Server
 *
 * Bridges MCP (Model Context Protocol) clients to the Ooznest Control backend.
 * Connects to ws://localhost:8081 (the existing Electron backend WebSocket).
 *
 * Transports:
 *   stdio  — for Claude Desktop, VS Code, CLI
 *   http   — Server-Sent Events + POST for n8n, web apps
 *   mqtt   — optional, for Home Assistant, Node-RED (requires mqtt package)
 *
 * Usage:
 *   node mcp-server.js                     # stdio + http on :3001
 *   node mcp-server.js --transports stdio  # stdio only
 *   node mcp-server.js --http-port 4000    # http on :4000
 *   MCP_API_KEY=secret node mcp-server.js  # require API key for HTTP
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { WebSocket } = require('ws');
const { randomUUID } = require('crypto');

// ─── Config ───────────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'mcp-config.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch (e) {}
const cfg = Object.assign({
    backendUrl: 'ws://localhost:8081',
    transports: ['stdio', 'http'],
    httpPort: parseInt(process.env.MCP_HTTP_PORT || config.httpPort || 3001),
    mqttBroker: process.env.MCP_MQTT_BROKER || config.mqttBroker || null,
    mqttTopicPrefix: config.mqttTopicPrefix || 'ooznest/',
    apiKey: process.env.MCP_API_KEY || config.apiKey || null,
    actuatorMap: config.actuatorMap || {}
}, config);

// ─── State Mirror ──────────────────────────────────────────────
let machine = {
    connected: false,
    status: 'Offline',
    mpos: { x: 0, y: 0, z: 0, a: 0 },
    wpos: { x: 0, y: 0, z: 0, a: 0 },
    wco: { x: 0, y: 0, z: 0 },
    feed: 0, spindle: 0,
    ov: [100, 100, 100],
    wcs: 'G54',
    pins: '',
    ina219: { voltage: 0, current: 0 },
    limits: { x: 0, y: 0, z: 0 },
    homingDirMask: 0,
    isPositiveSpace: false
};
let job = { active: false, name: null, currentLine: 0, totalLines: 0, pct: 0 };
let loadedGcode = null;

// ─── Backend WebSocket Bridge ──────────────────────────────────
let backendWs = null;
let pendingRequests = new Map();
let cmdId = 0;

function connectBackend() {
    if (backendWs && backendWs.readyState === WebSocket.OPEN) return;
    try {
        backendWs = new WebSocket(cfg.backendUrl);
    } catch (e) {
        console.error(`[MCP] Cannot connect to backend at ${cfg.backendUrl}: ${e.message}`);
        return;
    }
    backendWs.on('open', () => {
        log('Connected to backend at ' + cfg.backendUrl);
    });
    backendWs.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        if (msg.type === 'statusUpdate') {
            setStatusPath(msg.path, msg.value);
        } else if (msg.type === 'syncStatus') {
            Object.assign(machine, msg.machine || {});
            Object.assign(job, msg.job || {});
            loadedGcode = msg.gcode?.content || loadedGcode;
            machine.connected = msg.comms?.connected || false;
        } else if (msg.type === 'gcodeLoaded') {
            loadedGcode = msg.content;
        } else if (msg.type === 'data') {
            const rawBytes = Buffer.from(msg.data, 'base64').toString('utf-8');
            rawBytes.split('\n').forEach(line => {
                line = line.trim();
                if (!line) return;
                if (line.startsWith('<')) parseStatusReport(line);
                if (line === 'ok' || line.startsWith('error:')) {
                    const res = pendingRequests.get('last');
                    if (res) { res(line); pendingRequests.delete('last'); }
                }
            });
        }
    });
    backendWs.on('close', () => {
        machine.connected = false;
        setTimeout(connectBackend, 3000);
    });
    backendWs.on('error', () => {});
}

function sendRaw(data) {
    if (!backendWs || backendWs.readyState !== WebSocket.OPEN) return;
    const msg = JSON.stringify({ type: 'write', data: Buffer.from(data).toString('base64'), encoding: 'base64' });
    backendWs.send(msg);
}

function sendCommand(cmd) {
    sendRaw(cmd + '\n');
}

function setStatusPath(path, value) {
    const parts = path.split('.');
    let target = machine;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!target[parts[i]]) target[parts[i]] = {};
        target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;
}

function parseStatusReport(line) {
    const parts = line.slice(1, -1).split('|');
    machine.status = parts[0].split(':')[0];
    parts.forEach(p => {
        if (p.startsWith('MPos:')) {
            const v = p.slice(5).split(',').map(Number);
            machine.mpos = { x: v[0]||0, y: v[1]||0, z: v[2]||0, a: v[3]||0 };
        } else if (p.startsWith('WPos:')) {
            const v = p.slice(5).split(',').map(Number);
            machine.wpos = { x: v[0]||0, y: v[1]||0, z: v[2]||0, a: v[3]||0 };
        } else if (p.startsWith('WCO:')) {
            const v = p.slice(4).split(',').map(Number);
            machine.wco = { x: v[0]||0, y: v[1]||0, z: v[2]||0 };
        } else if (p.startsWith('FS:')) {
            const s = p.slice(3).split(',');
            machine.feed = parseFloat(s[0]) || 0;
            machine.spindle = parseFloat(s[1]) || 0;
        } else if (p.startsWith('Ov:')) {
            machine.ov = p.slice(3).split(',').map(Number);
        } else if (p.startsWith('Pn:')) {
            machine.pins = p.slice(3);
        } else if (p.startsWith('INA219:')) {
            const v = p.slice(7).split(',');
            machine.ina219 = { voltage: parseFloat(v[0])||0, current: parseFloat(v[1])||0 };
        }
    });
}

function log(msg) {
    process.stderr.write(`[MCP] ${new Date().toISOString().slice(11,19)} ${msg}\n`);
}

// ─── MCP Protocol ──────────────────────────────────────────────
// Tools definition
const TOOLS = [
    {
        name: 'gcode_send',
        description: 'Send a single G-code or M-code command to the machine',
        inputSchema: { type: 'object', properties: { line: { type: 'string', description: 'G-code command (e.g. G91 G0 Z10)' } }, required: ['line'] }
    },
    {
        name: 'gcode_load',
        description: 'Load G-code content into the machine buffer for streaming',
        inputSchema: { type: 'object', properties: { content: { type: 'string', description: 'Full G-code program' } }, required: ['content'] }
    },
    {
        name: 'job_run',
        description: 'Start streaming the loaded G-code to the machine',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'job_pause',
        description: 'Pause the currently running job',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'job_resume',
        description: 'Resume a paused job',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'job_stop',
        description: 'Stop the job and perform a soft reset',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'axis_home',
        description: 'Home a specific axis',
        inputSchema: { type: 'object', properties: { axis: { type: 'string', enum: ['x','y','z','a','all'] } }, required: ['axis'] }
    },
    {
        name: 'axis_jog',
        description: 'Jog an axis by a relative distance',
        inputSchema: {
            type: 'object', properties: {
                x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' }, a: { type: 'number' },
                feed: { type: 'number', description: 'Feed rate in units/min' }
            }
        }
    },
    {
        name: 'axis_move',
        description: 'Absolute G0 rapid move to position',
        inputSchema: {
            type: 'object', properties: {
                x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' }, a: { type: 'number' },
                feed: { type: 'number', description: 'Feed rate for G1 (omit for rapid)' }
            }
        }
    },
    {
        name: 'spindle_set',
        description: 'Set spindle speed and turn on',
        inputSchema: { type: 'object', properties: { speed: { type: 'number' }, direction: { type: 'string', enum: ['cw','ccw'], default: 'cw' } }, required: ['speed'] }
    },
    {
        name: 'spindle_stop',
        description: 'Stop the spindle (M5)',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'alarm_unlock',
        description: 'Clear alarm state ($X)',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'actuator_move',
        description: 'Move a named actuator by distance. Maps to G-code via actuator config.',
        inputSchema: { type: 'object', properties: { id: { type: ['string','number'] }, distance: { type: 'number' }, feed: { type: 'number' } }, required: ['id','distance'] }
    },
    {
        name: 'actuator_stop',
        description: 'Emergency stop an actuator',
        inputSchema: { type: 'object', properties: { id: { type: ['string','number'] } }, required: ['id'] }
    },
    {
        name: 'probe_execute',
        description: 'Execute a G38.2 probe cycle',
        inputSchema: { type: 'object', properties: { axis: { type: 'string', enum: ['x','y','z'] }, direction: { type: 'number', description: '-1 or 1' }, feed: { type: 'number' }, retract: { type: 'number' } }, required: ['axis','direction','feed'] }
    },
    {
        name: 'wcs_set_offset',
        description: 'Set a work coordinate offset (G92 or G10 L20)',
        inputSchema: { type: 'object', properties: { axis: { type: 'string' }, value: { type: 'number' } }, required: ['axis','value'] }
    },
    {
        name: 'machine_status',
        description: 'Get the current machine status summary',
        inputSchema: { type: 'object', properties: {} }
    }
];

const RESOURCES = [
    { uri: 'machine://status', name: 'Machine Status', description: 'Current machine state, position, feed, spindle', mimeType: 'application/json' },
    { uri: 'machine://limits', name: 'Machine Limits', description: 'Soft limits from grblHAL settings', mimeType: 'application/json' },
    { uri: 'machine://pins', name: 'Pin States', description: 'Current input pin states from Pn:', mimeType: 'application/json' },
    { uri: 'machine://ina219', name: 'Power Monitor', description: 'INA219 voltage and current', mimeType: 'application/json' },
    { uri: 'job://progress', name: 'Job Progress', description: 'Current job streaming progress', mimeType: 'application/json' },
    { uri: 'gcode://content', name: 'Loaded G-Code', description: 'The currently loaded G-code content', mimeType: 'text/plain' },
    { uri: 'actuator://config', name: 'Actuator Configuration', description: 'Configured actuator map', mimeType: 'application/json' }
];

const PROMPTS = [
    { name: 'troubleshoot_alarm', description: 'Given an alarm/error code, suggest diagnostic steps', arguments: [{ name: 'code', description: 'Alarm or error code', required: true }] },
    { name: 'generate_gcode', description: 'Generate G-code from a natural language description', arguments: [{ name: 'description', description: 'What to make (dimensions, operation)', required: true }] },
    { name: 'job_report', description: 'Formatted summary of the completed or running job', arguments: [] },
    { name: 'diagnose_connection', description: 'Troubleshoot connection issues with the controller', arguments: [] }
];

function handleMCPRequest(method, params) {
    switch (method) {
        case 'initialize':
            return { protocolVersion: '2024-11-05', capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: 'ooznest-control-mcp', version: '1.0.0' } };
        case 'tools/list':
            return { tools: TOOLS };
        case 'tools/call':
            return callTool(params.name, params.arguments || {});
        case 'resources/list':
            return { resources: RESOURCES };
        case 'resources/read':
            return readResource(params.uri);
        case 'prompts/list':
            return { prompts: PROMPTS };
        case 'prompts/get':
            return getPrompt(params.name, params.arguments || {});
        default:
            throw new Error(`Unknown method: ${method}`);
    }
}

function callTool(name, args) {
    const result = (text) => ({ content: [{ type: 'text', text }] });
    switch (name) {
        case 'gcode_send':
            if (!machine.connected) return result('Machine is not connected.');
            sendCommand(args.line);
            return result(`Sent: ${args.line}`);
        case 'gcode_load':
            loadedGcode = args.content;
            if (backendWs && backendWs.readyState === WebSocket.OPEN) {
                backendWs.send(JSON.stringify({ type: 'loadGCode', content: args.content }));
            }
            return result(`Loaded ${args.content.split('\n').length} lines of G-code.`);
        case 'job_run':
            sendRaw('\x18'); setTimeout(() => { sendCommand('$X'); }, 100);
            setTimeout(() => {
                if (backendWs && backendWs.readyState === WebSocket.OPEN) {
                    backendWs.send(JSON.stringify({ type: 'updateJob', job: { active: true, currentLine: 0, totalLines: (loadedGcode || '').split('\n').length, pct: 0 } }));
                }
            }, 500);
            return result('Job started (soft reset + unlock issued first).');
        case 'job_pause':
            sendRaw('!');
            return result('Job paused.');
        case 'job_resume':
            sendRaw('~');
            return result('Job resumed.');
        case 'job_stop':
            sendRaw('\x18');
            return result('Job stopped via soft reset.');
        case 'axis_home': {
            const a = args.axis.toLowerCase();
            if (a === 'all') sendCommand('$H');
            else sendCommand(`$H${a.toUpperCase()}`);
            return result(`Homing ${a}...`);
        }
        case 'axis_jog': {
            const parts = [];
            ['x','y','z','a'].forEach(a => { if (args[a] !== undefined) parts.push(`${a.toUpperCase()}${args[a]}`); });
            if (!parts.length) return result('No axes specified.');
            const feed = args.feed || 1000;
            sendCommand(`G91 G1 ${parts.join(' ')} F${feed}`);
            return result(`Jogging: G91 G1 ${parts.join(' ')} F${feed}`);
        }
        case 'axis_move': {
            const parts = [];
            ['x','y','z','a'].forEach(a => { if (args[a] !== undefined) parts.push(`${a.toUpperCase()}${args[a]}`); });
            if (!parts.length) return result('No axes specified.');
            const cmd = args.feed ? `G1 ${parts.join(' ')} F${args.feed}` : `G0 ${parts.join(' ')}`;
            sendCommand(cmd);
            return result(`Moving: ${cmd}`);
        }
        case 'spindle_set': {
            const dir = args.direction === 'ccw' ? 'M4' : 'M3';
            sendCommand(`${dir} S${args.speed}`);
            return result(`${dir} S${args.speed}`);
        }
        case 'spindle_stop':
            sendCommand('M5');
            return result('M5 - Spindle stopped.');
        case 'alarm_unlock':
            sendCommand('$X');
            return result('$X - Unlock sent.');
        case 'actuator_move': {
            const act = cfg.actuatorMap[String(args.id)];
            if (!act) return result(`Actuator "${args.id}" not configured. See actuator://config`);
            const sign = args.distance >= 0 ? '+' : '';
            const axis = (act.axis || 'z').toUpperCase();
            const feed = args.feed || act.feed || 500;
            sendCommand(`G91 G1 ${axis}${sign}${args.distance} F${feed}`);
            return result(`Actuator ${args.id} (${act.name || axis}): G91 G1 ${axis}${sign}${args.distance} F${feed}`);
        }
        case 'actuator_stop':
            sendRaw('\x85');
            return result('Feed hold sent to stop actuator.');
        case 'probe_execute': {
            const dir = args.direction < 0 ? '-' : '';
            sendCommand(`G91 G38.2 ${args.axis.toUpperCase()}${dir}${args.feed} F${args.feed}`);
            if (args.retract) sendCommand(`G91 G0 ${args.axis.toUpperCase()}${args.retract > 0 ? '+' : ''}${args.retract}`);
            return result(`Probing: G91 G38.2 ${args.axis.toUpperCase()}${dir}${args.feed}`);
        }
        case 'wcs_set_offset':
            sendCommand(`G10 L20 P1 ${args.axis.toUpperCase()}${args.value}`);
            return result(`Offset set: G10 L20 P1 ${args.axis.toUpperCase()}${args.value}`);
        case 'machine_status': {
            const s = JSON.stringify({ machine, job, loadedLines: (loadedGcode || '').split('\n').length }, null, 2);
            return result(s);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

function readResource(uri) {
    const text = (t) => ({ contents: [{ uri, mimeType: 'text/plain', text: t }] });
    const json = (o) => ({ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(o, null, 2) }] });
    switch (uri) {
        case 'machine://status': return json({ machine, job });
        case 'machine://limits': return json(machine.limits);
        case 'machine://pins': return json({ pins: machine.pins });
        case 'machine://ina219': return json(machine.ina219);
        case 'job://progress': return json(job);
        case 'gcode://content': return text(loadedGcode || '');
        case 'actuator://config': return json(cfg.actuatorMap);
        default: throw new Error(`Unknown resource: ${uri}`);
    }
}

function getPrompt(name, args) {
    const msg = (msgs) => ({ messages: msgs.map(m => ({ role: 'user', content: { type: 'text', text: m } })) });
    switch (name) {
        case 'troubleshoot_alarm':
            return msg([`The CNC controller reported alarm/error code: ${args.code}. Current status: ${machine.status}. Position: ${JSON.stringify(machine.mpos)}. Suggest diagnostic steps including checking limit switches, homing, and electrical connections.`]);
        case 'generate_gcode':
            return msg([`The user wants to generate G-code for the following: ${args.description}. The machine has axes X, Y, Z${machine.limits.x ? ` with limits X:0-${machine.limits.x}, Y:0-${machine.limits.y}, Z:0-${machine.limits.z}` : ''}. Provide complete G-code with G21 (mm mode), appropriate feed rates, and safety moves.`]);
        case 'job_report':
            return msg([`Summarize the current job state. Machine status: ${machine.status}. Job: ${JSON.stringify(job)}. Machine position: ${JSON.stringify(machine.mpos)}. Spindle: ${machine.spindle}RPM, Feed: ${machine.feed}.`]);
        case 'diagnose_connection':
            return msg([`The controller connection status is: ${machine.connected ? 'Connected' : 'Disconnected'}. Current transport: ${cfg.backendUrl}. Check if the backend is running (port 8081), USB cable is connected, and the controller is powered.`]);
        default:
            throw new Error(`Unknown prompt: ${name}`);
    }
}

// ─── Stdio Transport (MCP JSON-RPC over stdin/stdout) ─────────
function startStdio() {
    let buffer = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const req = JSON.parse(trimmed);
                handleStdioRequest(req);
            } catch (e) {
                // ignore parse errors
            }
        }
    });
    // Send capabilities on connect (MCP initialization by client)
    log('Stdio transport ready');
}

function handleStdioRequest(req) {
    const id = req.id;
    const respond = (result) => {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
    };
    const respondError = (code, message) => {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
    };
    try {
        if (req.method === 'notifications/initialized') return;
        const result = handleMCPRequest(req.method, req.params || {});
        respond(result);
    } catch (e) {
        respondError(-32601, e.message);
    }
}

// ─── HTTP/SSE Transport ───────────────────────────────────────
function startHttp() {
    const sseClients = [];

    function broadcastSSE(event, data) {
        const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        sseClients.forEach(res => res.write(msg));
    }

    const server = http.createServer((req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

        // Auth check
        const checkAuth = () => {
            if (!cfg.apiKey) return true;
            const auth = req.headers['authorization'] || '';
            return auth === `Bearer ${cfg.apiKey}` || auth === cfg.apiKey;
        };

        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathname = url.pathname;

        // SSE endpoint
        if (pathname === '/sse' && req.method === 'GET') {
            if (!checkAuth()) { res.writeHead(401); res.end('Unauthorized'); return; }
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            // Send the endpoint for client messages
            res.write(`event: endpoint\ndata: /message\n\n`);
            sseClients.push(res);
            // Send initial resource list notification
            res.write(`event: initialized\ndata: {}\n\n`);
            req.on('close', () => {
                const idx = sseClients.indexOf(res);
                if (idx >= 0) sseClients.splice(idx, 1);
            });
            return;
        }

        // Message endpoint (client -> server via POST)
        if (pathname === '/message' && req.method === 'POST') {
            if (!checkAuth()) { res.writeHead(401); res.end('Unauthorized'); return; }
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
                try {
                    const msg = JSON.parse(body);
                    if (msg.id) {
                        const result = handleMCPRequest(msg.method, msg.params || {});
                        broadcastSSE('result', { id: msg.id, result });
                    }
                } catch (e) {
                    // ignore
                }
                res.writeHead(202);
                res.end('Accepted');
            });
            return;
        }

        // n8n / health endpoint
        if (pathname === '/health' || pathname === '/') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', connected: machine.connected, machineStatus: machine.status }));
            return;
        }

        // Tools list (for n8n manual tool registration)
        if (pathname === '/mcp/tools') {
            if (!checkAuth()) { res.writeHead(401); res.end('Unauthorized'); return; }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ tools: TOOLS }));
            return;
        }

        // Call tool via HTTP (for n8n webhook style)
        if (pathname === '/mcp/call' && req.method === 'POST') {
            if (!checkAuth()) { res.writeHead(401); res.end('Unauthorized'); return; }
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
                try {
                    const { name, arguments: args } = JSON.parse(body);
                    const result = callTool(name, args || {});
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // Status endpoint (for n8n polling)
        if (pathname === '/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ machine, job }));
            return;
        }

        res.writeHead(404);
        res.end('Not found');
    });

    server.listen(cfg.httpPort, '0.0.0.0', () => {
        log(`HTTP/SSE transport listening on :${cfg.httpPort}`);
        log(`  SSE:       http://localhost:${cfg.httpPort}/sse`);
        log(`  Status:    http://localhost:${cfg.httpPort}/status`);
        log(`  Tools:     http://localhost:${cfg.httpPort}/mcp/tools`);
        log(`  Call Tool: POST http://localhost:${cfg.httpPort}/mcp/call`);
        if (cfg.apiKey) log(`  API Key:   ${cfg.apiKey}`);
    });
}

// ─── MQTT Transport ───────────────────────────────────────────
function startMqtt() {
    let mqtt;
    try {
        mqtt = require('mqtt');
    } catch (e) {
        log('MQTT transport skipped: mqtt package not installed (npm install mqtt)');
        return;
    }
    const opts = {};
    if (cfg.apiKey) opts.password = cfg.apiKey;
    const client = mqtt.connect(cfg.mqttBroker, opts);
    const t = cfg.mqttTopicPrefix;

    client.on('connect', () => {
        log(`MQTT connected to ${cfg.mqttBroker}`);
        client.subscribe(t + 'cmd/+');
        // Publish status periodically
        setInterval(() => {
            client.publish(t + 'status', JSON.stringify(machine));
            client.publish(t + 'job/progress', JSON.stringify(job));
            client.publish(t + 'ina219', JSON.stringify(machine.ina219));
        }, 1000);
    });

    client.on('message', (topic, payload) => {
        const cmd = topic.replace(t, '');
        try {
            const data = JSON.parse(payload.toString());
            if (cmd === 'cmd/gcode') sendCommand(data.line || payload.toString());
            else if (cmd === 'cmd/jog') {
                const parts = [];
                ['x','y','z','a'].forEach(a => { if (data[a] !== undefined) parts.push(`${a.toUpperCase()}${data[a]}`); });
                if (parts.length) sendCommand(`G91 G1 ${parts.join(' ')} F${data.feed || 1000}`);
            } else if (cmd === 'cmd/actuator') {
                const act = cfg.actuatorMap[String(data.id)];
                if (act) sendCommand(`G91 G1 ${(act.axis || 'z').toUpperCase()}${data.distance >= 0 ? '+' : ''}${data.distance} F${data.feed || act.feed || 500}`);
            } else if (cmd === 'cmd/job') {
                if (data.action === 'pause') sendRaw('!');
                else if (data.action === 'resume') sendRaw('~');
                else if (data.action === 'stop') sendRaw('\x18');
            }
        } catch (e) {}
    });
}

// ─── Startup ───────────────────────────────────────────────────
function main() {
    log('Starting Ooznest Control MCP Server...');
    connectBackend();

    const transports = cfg.transports;

    if (transports.includes('stdio')) startStdio();
    if (transports.includes('http')) startHttp();
    if (transports.includes('mqtt') || cfg.mqttBroker) startMqtt();

    log(`Transports: ${transports.join(', ')}`);
    if (cfg.apiKey) log('API key authentication is enabled.');

    if (Object.keys(cfg.actuatorMap).length) {
        log(`Actuators configured: ${Object.keys(cfg.actuatorMap).join(', ')}`);
    }
}

main();
