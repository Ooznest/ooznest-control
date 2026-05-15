export class FirmwareHandler {
    constructor(ws, store) {
        this.ws = ws;
        this.store = store;
        this.device = null;
        this.transport = null;
        this.esploader = null;
        this._loaded = false;
    }

    async connectDevice() {
        const term = this._term();
        try {
            if (this.device) await this.transport.disconnect();
            term.clean();

            if (!navigator.serial) {
                term.writeLine('[ERROR] Web Serial API not available on this platform.');
                term.writeLine('Try using Chrome, Edge, or the Electron desktop app.');
                return;
            }

            term.writeLine('[SYSTEM] Requesting ESP32 device port...');

            this.device = await navigator.serial.requestPort({
                filters: [{ usbVendorId: 0x303a, usbProductId: 0x1001 }]
            });

            const { ESPLoader, Transport, ClassicReset, HardReset } = await import(
                'https://unpkg.com/esptool-js/bundle.js'
            );

            this.transport = new Transport(this.device);
            this.esploader = new ESPLoader({
                transport: this.transport,
                baudrate: parseInt(document.getElementById('fw-baudrate').value),
                terminal: term,
                resetConstructors: {
                    classicReset: (t, d) => new ClassicReset(t, d),
                    hardReset: (t, u) => new HardReset(t, u),
                }
            });

            const chipName = await this.esploader.main('default_reset');
            term.writeLine(`\n[SUCCESS] Connected to ${chipName}`);

            document.getElementById('fw-connect').disabled = true;
            document.getElementById('fw-flash').disabled = false;

        } catch (e) {
            term.writeLine(`\n[ERROR] ${e.message}`);
            document.getElementById('fw-connect').disabled = false;
        }
    }

    async flashFirmware() {
        const term = this._term();
        const progressWrap = document.getElementById('fw-progress-wrap');
        const progressBar = document.getElementById('fw-progress-bar');
        const progressPct = document.getElementById('fw-progress-pct');
        const btnFlash = document.getElementById('fw-flash');
        const btnConnect = document.getElementById('fw-connect');

        try {
            btnFlash.disabled = true;
            progressWrap.classList.remove('hidden');

            const loadFile = async (path) => {
                term.writeLine(`[FILE] Loading ${path}...`);
                const r = await fetch(path);
                if (!r.ok) throw new Error(`Failed to load ${path}`);
                return new Uint8Array(await r.arrayBuffer());
            };

            const base = 'firmware/';
            const bootloader = await loadFile(base + 'bootloader.bin');
            const partitions = await loadFile(base + 'partitions.bin');
            const firmware = await loadFile(base + 'firmware.bin');

            await this.esploader.writeFlash({
                fileArray: [
                    { data: bootloader, address: 0x0000 },
                    { data: partitions, address: 0x8000 },
                    { data: firmware,   address: 0x10000 }
                ],
                flashMode: document.getElementById('fw-flashmode').value,
                flashFreq: '40m',
                flashSize: '4MB',
                compress: true,
                reportProgress: (i, written, total) => {
                    const p = Math.round((written / total) * 100);
                    progressBar.style.width = p + '%';
                    progressPct.textContent = p + '%';
                },
                calculateMD5Hash: (img) => CryptoJS.MD5(CryptoJS.lib.WordArray.create(img)).toString()
            });

            term.writeLine('\n[COMPLETE] Device flashed successfully.');
            document.getElementById('fw-success-modal').classList.remove('hidden');
            btnConnect.disabled = false;

        } catch (e) {
            const msg = e.message || 'Unknown error';
            term.writeLine(`\n[CRITICAL] ${msg}`);

            document.getElementById('fw-error-title').textContent = 'Deployment Failed';
            document.getElementById('fw-error-msg').textContent = msg;

            if (msg.includes('device has been lost') || msg.includes('disconnected')) {
                document.getElementById('fw-error-title').textContent = 'Connection Lost';
                document.getElementById('fw-error-advice').innerHTML =
                    '<strong>Possible Causes:</strong><br>' +
                    '&#8226; USB Cable was disconnected or bumped.<br>' +
                    '&#8226; OS power-management reset the port.<br><br>' +
                    '<strong>Try:</strong> Using a <u>lower Baud Rate</u> (e.g. 115200) and a different USB cable/port.';
            } else {
                document.getElementById('fw-error-advice').textContent =
                    'Please check the USB connection and ensure the device is in Bootloader mode before trying again.';
            }

            document.getElementById('fw-error-modal').classList.remove('hidden');
            btnConnect.disabled = false;
        } finally {
            btnFlash.disabled = false;
        }
    }

    closeSuccessModal() {
        document.getElementById('fw-success-modal').classList.add('hidden');
    }

    closeErrorModal() {
        document.getElementById('fw-error-modal').classList.add('hidden');
    }

    _checkPlatform() {
        const term = this._term();
        if (!navigator.serial) {
            term.writeLine('\n[PLATFORM] Web Serial API is not available on this device.');
            term.writeLine('[PLATFORM] Firmware flashing requires a desktop browser (Chrome/Edge)');
            term.writeLine('[PLATFORM] or the Electron desktop app with USB access.\n');
        }
    }

    toggleSettings() {
        const panel = document.getElementById('fw-settings');
        panel.classList.toggle('hidden');
    }

    _term() {
        return {
            _el: document.getElementById('fw-terminal'),
            clean() {
                this._el.textContent = '';
            },
            writeLine(data) {
                this.write(data + '\n');
            },
            write(data) {
                this._el.textContent += data;
                this._el.scrollTop = this._el.scrollHeight;
            }
        };
    }
}
