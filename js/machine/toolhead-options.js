// These labels describe the Ooznest board's fixed output wiring.
export const TOOLHEAD_SLOTS = [
    { id: '395', label: 'Primary Toolhead' },
    { id: '511', label: 'Secondary Toolhead' },
    { id: '512', label: 'Tertiary Toolhead' }
];

const ROUTER_HEADS = [
    { id: 'workbee-router-head', name: 'WorkBee Router Head (Manual)' },
    { id: 'mafell-digital', name: 'Mafell FM 1000 NC-ER Router Head (Portal Control)' },
    { id: 'mafell-manual', name: 'Mafell FM 1000 Router Head (Manual Control)' },
    { id: 'vfd-0-10v', name: 'VFD Spindle (0-10V Control)' }
];

const VFD_NAMES = {
    'huanyang v1': 'Huanyang V1',
    'huanyang p2a': 'Huanyang P2A',
    'durapulse gs20': 'Durapulse GS20',
    'yalang ys620': 'Yalang YL620A',
    'yalang yl620a': 'Yalang YL620A',
    'modvfd': 'Generic VFD',
    'h-100': 'H-100',
    'nowforever': 'Nowforever'
};

export function getToolheadOptions(entries, routerHeads = []) {
    const options = [];
    for (const { name, value } of entries) {
        if (!name || /^(?:-|n\/a)$/i.test(name)) continue;
        const source = name.toLowerCase();
        const base = { value, source };
        if (/^(disabled|none|off)$/i.test(name)) {
            options.push({ ...base, key: `${value}:disabled`, name: 'None', kind: 'disabled' });
        } else if (/^pwm(?:1)?$/i.test(name)) {
            for (const head of ROUTER_HEADS) {
                const label = routerHeads.find(router => router.id === head.id)?.name || head.name;
                options.push({ ...base, key: `${value}:${head.id}`, name: label, profile: head.id, kind: 'router' });
            }
        } else if (/^pwm2$/i.test(name)) {
            options.push({ ...base, key: `${value}:laser`, name: 'Laser', profile: 'laser-pwm', kind: 'laser' });
        } else {
            options.push({ ...base, key: `${value}:vfd`, name: `${VFD_NAMES[source] || name} (Modbus)`, profile: 'vfd-modbus', kind: 'vfd' });
        }
    }
    return options;
}
