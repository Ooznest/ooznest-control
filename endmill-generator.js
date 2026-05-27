import * as THREE from 'three';

const DEFAULT_PARAMS = {
    toolType: 'Flat Endmill',
    diameter: 6.0,
    flutes: 4,
    helixAngle: 30,
    fluteDepth: 0.38,
    cuttingLength: 22.0,
    vAngle: 60,
    shankLength: 32.0,
    exposedShank: 8.0,
    showHolder: true,
    coating: 'TiN (Gold)'
};

const COATING_COLORS = {
    'Carbide (Uncoated)': { color: 0x7a7e82, metalness: 0.35, roughness: 0.45 },
    'TiN (Gold)': { color: 0xd4af37, metalness: 0.40, roughness: 0.35 },
    'AlTiN (Violet/Black)': { color: 0x585365, metalness: 0.35, roughness: 0.40 },
    'TiCN (Rose/Bronze)': { color: 0xc5806c, metalness: 0.40, roughness: 0.35 }
};

function applyBaseShape(geometry, toolType, R, H) {
    const position = geometry.attributes.position;
    const bottomY = -H / 2;

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);

        const r0 = Math.sqrt(x * x + z * z);
        if (r0 < 0.001) continue;

        if (toolType === 'Ball Nose') {
            const domeHeight = R;
            const boundaryY = bottomY + domeHeight;
            if (y < boundaryY) {
                const dy = y - boundaryY;
                const targetR = Math.sqrt(R * R - dy * dy);
                const s = targetR / R;
                position.setXYZ(i, x * s, y, z * s);
            }
        }
    }
}

function applyFlutes(geometry, toolType, R, H, N, beta, depthRatio) {
    const position = geometry.attributes.position;
    const topY = H / 2;
    const bottomY = -H / 2;
    const k = Math.tan(beta) / R;

    const fluteWidthRatio = 0.45;
    const W = (Math.PI * 2 / N) * fluteWidthRatio;
    const maxDepth = R * depthRatio;

    const transitionHeight = Math.min(6.0, H * 0.25);

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);

        const r0 = Math.sqrt(x * x + z * z);
        if (r0 < 0.001) continue;

        const currentR = r0;
        const theta = Math.atan2(z, x);

        let diff = (theta - k * y) % (Math.PI * 2 / N);
        if (diff < 0) diff += (Math.PI * 2 / N);
        if (diff > Math.PI / N) diff -= (Math.PI * 2 / N);

        const d = Math.abs(diff);

        let depthScale = 1.0;
        if (y > topY - transitionHeight && transitionHeight > 0) {
            const t = (topY - y) / transitionHeight;
            depthScale = Math.sin(t * Math.PI / 2);
        }

        let tipScale = 1.0;
        if (toolType === 'Ball Nose') {
            const h = y - bottomY;
            tipScale = Math.min(1.0, h / R);
        }

        let f = 1.0;
        if (d < W) {
            const cosVal = Math.cos((d / W) * (Math.PI / 2));
            const depth = maxDepth * cosVal * cosVal * depthScale * tipScale;
            const newR = Math.max(0.1, currentR - depth);
            f = newR / currentR;
        }

        position.setXYZ(i, x * f, y, z * f);
    }

    geometry.computeVertexNormals();
}

function buildToolGroup(params) {
    const group = new THREE.Group();

    const R = params.diameter / 2;
    let H_cut = params.cuttingLength;
    const H_shank = params.shankLength;

    if (params.toolType === 'Surfacing Bit') {
        H_cut = 12.0;
    }

    let R_shank = R;
    if (params.toolType === 'V-Bit' || params.toolType === 'Surfacing Bit') {
        R_shank = 6.35 / 2;
    }

    // --- Cutter ---
    let cutterGeo;
    if (params.toolType === 'V-Bit') {
        cutterGeo = new THREE.CylinderGeometry(R, 0, H_cut, 64, 1, false);
    } else if (params.toolType === 'Surfacing Bit') {
        cutterGeo = new THREE.CylinderGeometry(R, R, H_cut, 64, 1, false);
    } else {
        cutterGeo = new THREE.CylinderGeometry(R, R, H_cut, 64, 128, false);
        applyBaseShape(cutterGeo, params.toolType, R, H_cut);
        applyFlutes(cutterGeo, params.toolType, R, H_cut, params.flutes, params.helixAngle * Math.PI / 180, params.fluteDepth);
    }

    // Position in Y-up: tip at Y=0, top at Y=H_cut
    cutterGeo.translate(0, H_cut / 2, 0);

    const coating = COATING_COLORS[params.coating] || COATING_COLORS['Carbide (Uncoated)'];
    const cutterMat = new THREE.MeshStandardMaterial({
        color: coating.color,
        metalness: coating.metalness,
        roughness: coating.roughness
    });

    const cutterMesh = new THREE.Mesh(cutterGeo, cutterMat);
    cutterMesh.castShadow = true;
    cutterMesh.receiveShadow = true;
    group.add(cutterMesh);

    // --- Shank (Y-up: bottom at Y=H_cut, top at Y=H_cut+H_shank) ---
    const shankGeo = new THREE.CylinderGeometry(R_shank, R_shank, H_shank, 32, 1, false);
    shankGeo.translate(0, H_cut + H_shank / 2, 0);

    const shankMat = new THREE.MeshStandardMaterial({
        color: 0x8a9094,
        metalness: 0.35,
        roughness: 0.40
    });

    const shankMesh = new THREE.Mesh(shankGeo, shankMat);
    shankMesh.castShadow = true;
    shankMesh.receiveShadow = true;
    group.add(shankMesh);

    // --- Collet & Nut ---
    if (params.showHolder) {
        const holderBaseY = H_cut + params.exposedShank;
        const holderGroup = new THREE.Group();

        const nutMat = new THREE.MeshStandardMaterial({
            color: 0x424547,
            metalness: 0.45,
            roughness: 0.40
        });

        const hexGeo = new THREE.CylinderGeometry(R_shank + 5.0, R_shank + 5.0, 8.5, 6);
        hexGeo.translate(0, 4.25, 0);
        const hexMesh = new THREE.Mesh(hexGeo, nutMat);
        hexMesh.castShadow = true;
        hexMesh.receiveShadow = true;
        holderGroup.add(hexMesh);

        const flangeGeo = new THREE.CylinderGeometry(R_shank + 5.2, R_shank + 5.2, 1.5, 32);
        flangeGeo.translate(0, 9.25, 0);
        const flangeMesh = new THREE.Mesh(flangeGeo, nutMat);
        flangeMesh.castShadow = true;
        flangeMesh.receiveShadow = true;
        holderGroup.add(flangeMesh);

        holderGroup.position.y = holderBaseY;
        group.add(holderGroup);
    }

    // Rotate entire assembly from Y-up to Z-up for the viewer
    group.rotation.x = Math.PI / 2;

    return group;
}

export { DEFAULT_PARAMS, COATING_COLORS, buildToolGroup };
