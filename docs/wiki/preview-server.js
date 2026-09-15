/* Local-only preview server for the Wiki.js Markdown source. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.css': 'text/css; charset=utf-8'
};

function safePath(urlPath) {
    const requested = decodeURIComponent(urlPath.split('?')[0]);
    const relative = requested === '/' ? 'preview.html' : requested.replace(/^\/+/, '');
    const resolved = path.resolve(root, relative);
    return resolved.startsWith(root + path.sep) || resolved === root ? resolved : null;
}

http.createServer((request, response) => {
    const file = safePath(request.url || '/');
    if (!file) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
    }
    fs.readFile(file, (error, data) => {
        if (error) {
            response.writeHead(error.code === 'ENOENT' ? 404 : 500);
            response.end(error.code === 'ENOENT' ? 'Not found' : 'Unable to read file');
            return;
        }
        response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        response.end(data);
    });
}).listen(4175, '127.0.0.1', () => {
    console.log('Wiki preview: http://127.0.0.1:4175');
});
