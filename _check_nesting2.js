const fs = require('fs');
const h = fs.readFileSync('index.html', 'utf8');
const lines = h.split(/\r?\n/);
let depth = 0;
for (let i = 615; i < 685; i++) {
  const l = lines[i];
  const opens = (l.match(/<div[\s>\/]/gi) || []).length;
  const closes = (l.match(/<\/div>/gi) || []).length;
  depth += opens - closes;
  if (opens > 0 || closes > 0) {
      console.log('L' + (i+1) + ' (o=' + opens + ', c=' + closes + ') depth=' + depth + '  ' + l.trim().substring(0, 50));
  }
}
