(() => {
    const expectedBoard = 'Ooznest-Motion-Control-Core';
    const elements = {
        dropZone: document.getElementById('drop-zone'),
        fileInput: document.getElementById('file-input'),
        chooseFile: document.getElementById('choose-file'),
        error: document.getElementById('error-message'),
        results: document.getElementById('results'),
        title: document.getElementById('report-title'),
        meta: document.getElementById('report-meta'),
        summary: document.getElementById('summary'),
        checks: document.getElementById('checks'),
        controller: document.getElementById('controller-details'),
        evidence: document.getElementById('evidence'),
        clear: document.getElementById('clear-report')
    };

    const escapeHtml = value => String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const lines = value => Array.isArray(value) ? value : [];
    const hasEvidence = value => lines(value).length > 0;
    const formatDate = value => {
        const date = new Date(value);
        return Number.isNaN(date.valueOf()) ? 'Unknown export time' : date.toLocaleString();
    };

    function showError(message) {
        elements.error.textContent = message;
        elements.error.hidden = false;
    }

    function clearError() {
        elements.error.hidden = true;
        elements.error.textContent = '';
    }

    function validate(report) {
        if (!report || typeof report !== 'object' || Array.isArray(report)) {
            throw new Error('This file is not a troubleshooting JSON object.');
        }
        if (!report.firmware || !report.application || !report.exportedAt) {
            throw new Error('This does not look like an Ooznest troubleshooting export.');
        }
        return report;
    }

    function getZipJson(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const minimumZipSize = 22;
        if (bytes.length < minimumZipSize) throw new Error('The ZIP file is incomplete.');

        let endOffset = -1;
        for (let offset = bytes.length - minimumZipSize; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
            if (view.getUint32(offset, true) === 0x06054b50) {
                endOffset = offset;
                break;
            }
        }
        if (endOffset < 0) throw new Error('The ZIP file has no central directory.');

        const entryCount = view.getUint16(endOffset + 10, true);
        let offset = view.getUint32(endOffset + 16, true);
        const decoder = new TextDecoder();
        for (let entry = 0; entry < entryCount; entry += 1) {
            if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break;
            const compressionMethod = view.getUint16(offset + 10, true);
            const compressedSize = view.getUint32(offset + 20, true);
            const filenameLength = view.getUint16(offset + 28, true);
            const extraLength = view.getUint16(offset + 30, true);
            const commentLength = view.getUint16(offset + 32, true);
            const localHeaderOffset = view.getUint32(offset + 42, true);
            const filename = decoder.decode(bytes.slice(offset + 46, offset + 46 + filenameLength));

            if (/\.json$/i.test(filename)) {
                if (compressionMethod !== 0) {
                    throw new Error('This ZIP uses compression that this support tool cannot read. Please export it again from Ooznest Control.');
                }
                if (localHeaderOffset + 30 > bytes.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
                    throw new Error('The JSON file inside this ZIP is invalid.');
                }
                const localFilenameLength = view.getUint16(localHeaderOffset + 26, true);
                const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
                const dataOffset = localHeaderOffset + 30 + localFilenameLength + localExtraLength;
                if (dataOffset + compressedSize > bytes.length) throw new Error('The JSON file inside this ZIP is incomplete.');
                return decoder.decode(bytes.slice(dataOffset, dataOffset + compressedSize));
            }
            offset += 46 + filenameLength + extraLength + commentLength;
        }
        throw new Error('No troubleshooting JSON file was found in this ZIP.');
    }

    function buildChecks(report) {
        const checks = [];
        const firmware = report.firmware || {};
        const rawBuildInfo = lines(report.rawBuildInfo).join('\n');
        const limitLines = lines(report.limitSwitches);
        const sessionEvents = lines(report.sessionEvents);
        const pinSignal = lines(report.inputPins).join(' ');

        if (!rawBuildInfo) {
            checks.push(['problem', 'Controller build information is missing', 'Ask for a fresh export while connected to the controller so $I+ is included.']);
        } else {
            checks.push(['ok', 'Controller build information captured', 'Full $I+ output is included in the exported evidence.']);
        }

        if (firmware.board !== expectedBoard) {
            checks.push(['warning', 'Controller board is not an Ooznest Motion Control Core', `Reported board: ${firmware.board || 'Unknown'}. Firmware update guidance does not apply to this board.`]);
        } else {
            checks.push(['ok', 'Ooznest controller board confirmed', expectedBoard]);
        }

        if (!firmware.version || firmware.version === 'Unknown') {
            checks.push(['warning', 'Firmware version is unknown', 'The controller did not report a usable firmware version.']);
        }
        if (firmware.update?.updateAvailable) {
            checks.push(['warning', 'Newer firmware was available at export time', `Controller: ${firmware.version || 'Unknown'}; available: ${firmware.update.availableBuild || 'Unknown'}.`]);
        }
        if (/unconfigured/i.test(firmware.machineConfig || '')) {
            checks.push(['problem', 'Machine configuration is unconfigured', 'Run the configuration wizard before operating the machine.']);
        }
        if (limitLines.some(line => /TRIGGERED/i.test(line))) {
            checks.push(['warning', 'One or more limit inputs were active', limitLines.filter(line => /TRIGGERED/i.test(line)).join(' · ')]);
        } else if (hasEvidence(limitLines)) {
            checks.push(['ok', 'No active limit input reported', 'Review the raw Pn and pin-state evidence if the symptom is intermittent.']);
        }
        if (!/^Pn:\(no active input signals\)$/i.test(pinSignal) && pinSignal) {
            checks.push(['warning', 'Active realtime input signal(s) reported', pinSignal]);
        }
        if (sessionEvents.length) {
            checks.push(['warning', `${sessionEvents.length} alarm/error event${sessionEvents.length === 1 ? '' : 's'} recorded this session`, 'Review the session history below alongside the reported fault.']);
        } else {
            checks.push(['ok', 'No alarms or errors were recorded in this session', 'This does not include events before the application connected.']);
        }
        if (!hasEvidence(report.grblSettings)) {
            checks.push(['warning', 'GRBL settings were not captured', 'Ask for a fresh export after the settings have loaded.']);
        }
        return checks;
    }

    function render(report) {
        const firmware = report.firmware || {};
        const checkItems = buildChecks(report);
        const problems = checkItems.filter(([state]) => state === 'problem').length;
        const warnings = checkItems.filter(([state]) => state === 'warning').length;
        elements.title.textContent = `${firmware.board || 'Unknown controller'} export`;
        elements.meta.textContent = `Exported ${formatDate(report.exportedAt)} · App ${report.application?.version || 'Unknown'}`;
        elements.summary.innerHTML = [
            ['Problems', problems], ['Warnings', warnings], ['Checks completed', checkItems.length]
        ].map(([label, value]) => `<div class="bg-white px-5 py-4"><span class="block text-xl font-bold text-secondary-dark">${value}</span><span class="text-xs text-grey">${label}</span></div>`).join('');
        const checkStyles = {
            problem: 'border-red-400 bg-red-50',
            warning: 'border-primary/40 bg-orange-100',
            ok: 'border-green-300 bg-green-50'
        };
        elements.checks.innerHTML = checkItems.map(([state, title, detail]) => `<article class="rounded-lg border-l-4 ${checkStyles[state]} px-3 py-2"><span class="block text-sm font-bold text-secondary-dark">${escapeHtml(title)}</span><span class="mt-1 block text-xs leading-relaxed text-grey">${escapeHtml(detail)}</span></article>`).join('');
        const facts = [
            ['Firmware version', firmware.version], ['Machine config', firmware.machineConfig], ['Board', firmware.board],
            ['Available version', firmware.update?.availableBuild], ['App platform', report.application?.platform]
        ].filter(([, value]) => value !== undefined && value !== null && value !== '');
        elements.controller.innerHTML = facts.map(([label, value]) => `<div class="grid grid-cols-2 gap-3 py-2"><dt class="text-xs text-grey">${escapeHtml(label)}</dt><dd class="m-0 break-words text-right text-xs font-bold text-secondary-dark">${escapeHtml(value)}</dd></div>`).join('');
        const evidence = [
            ['Full Controller Build Info ($I+)', report.rawBuildInfo], ['Homing', report.homing], ['Limit Switches', report.limitSwitches],
            ['Live Input Signals (Pn)', report.inputPins], ['Session Alarm & Error History', report.sessionEvents],
            ['GRBL Setting Change History', report.settingChangeHistory], ['Power Supply', report.powerSupply], ['SD Card', report.sdCard],
            ['Probe Config', report.probeConfig], ['Spindles', report.spindles], ['Pin State', report.pinState], ['Macros', report.macros], ['Grbl Settings ($$)', report.grblSettings]
        ];
        elements.evidence.innerHTML = evidence.map(([title, value]) => {
            const content = hasEvidence(value) ? lines(value).join('\n') : 'Not available in this export.';
            return `<details class="overflow-hidden rounded-lg border border-grey-light"><summary class="cursor-pointer px-3 py-2 text-xs font-bold text-secondary-dark">${escapeHtml(title)}</summary><pre class="m-0 max-h-80 overflow-auto border-t border-grey-light bg-grey-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-grey-dark whitespace-pre-wrap break-words">${escapeHtml(content)}</pre></details>`;
        }).join('');
        elements.dropZone.hidden = true;
        elements.results.hidden = false;
    }

    async function loadFile(file) {
        if (!file) return;
        clearError();
        try {
            const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';
            const jsonText = isZip ? getZipJson(new Uint8Array(await file.arrayBuffer())) : await file.text();
            render(validate(JSON.parse(jsonText)));
        } catch (error) {
            showError(error.message || 'Unable to read this JSON file.');
        }
    }

    elements.chooseFile.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', event => loadFile(event.target.files[0]));
    ['dragenter', 'dragover'].forEach(type => elements.dropZone.addEventListener(type, event => {
        event.preventDefault();
        elements.dropZone.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach(type => elements.dropZone.addEventListener(type, event => {
        event.preventDefault();
        elements.dropZone.classList.remove('dragging');
    }));
    elements.dropZone.addEventListener('drop', event => loadFile(event.dataTransfer.files[0]));
    elements.clear.addEventListener('click', () => {
        elements.results.hidden = true;
        elements.dropZone.hidden = false;
        elements.fileInput.value = '';
        clearError();
    });
})();
