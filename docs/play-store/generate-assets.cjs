const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

(async () => {
    const output = path.join(__dirname, 'assets');
    const icon = path.join(__dirname, '../../cordova/resources/icon.png');
    fs.mkdirSync(output, { recursive: true });
    await sharp(icon).resize(512, 512).flatten({ background: '#ffffff' })
        .png().toFile(path.join(output, 'icon-512.png'));
    const logo = await sharp(icon).resize(280, 280).png().toBuffer();
    const graphic = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
        <rect width="1024" height="500" fill="#ffffff"/>
        <rect y="480" width="1024" height="20" fill="#ff6600"/>
        <text x="400" y="224" font-family="Arial" font-size="58" font-weight="bold" fill="#004c5b">Ooznest Control</text>
        <text x="402" y="282" font-family="Arial" font-size="28" fill="#004c5b">CNC control for your WorkBee</text>
    </svg>`);
    await sharp(graphic).composite([{ input: logo, left: 70, top: 110 }]).removeAlpha()
        .png().toFile(path.join(output, 'feature-1024x500.png'));
})().catch(error => { console.error(error); process.exitCode = 1; });
