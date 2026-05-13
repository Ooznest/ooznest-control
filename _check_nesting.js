const fs = require('fs');
const h = fs.readFileSync('index.html', 'utf8');
const lines = h.split(/\r?\n/);
let depth = 0;
const ids = ['main-content-area','viewer-view','editor-view','macros-view','surfacing-view','sd-view','tools-view','settings-view','probe-view','troubleshooting-view'];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const opens = (l.match(/<div[\s>\/]/gi) || []).length;
  const closes = (l.match(/<\/div>/gi) || []).length;
  depth += opens - closes;
  for (const id of ids) {
    if (l.includes('id="' + id + '"')) {
      console.log('L' + (i+1) + ' depth=' + depth + '  ' + id);
    }
  }
}
console.log('Final depth:', depth);
