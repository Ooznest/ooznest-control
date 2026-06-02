export function makeLine(cmd, orientation, u, v, extraArgs = {}) {
    let x, y;
    let i_val = extraArgs.i;
    let j_val = extraArgs.j;
    let i_out, j_out;

    if (orientation === 'X') {
        x = u;
        y = v;
        if (i_val !== undefined) i_out = i_val;
        if (j_val !== undefined) j_out = j_val;
    } else {
        x = -v;
        y = u;
        if (i_val !== undefined && j_val !== undefined) {
            i_out = -j_val;
            j_out = i_val;
        }
    }

    let str = cmd;
    str += ` X${x.toFixed(3)} Y${y.toFixed(3)}`;
    if (extraArgs.z !== undefined) {
        str += ` Z${extraArgs.z.toFixed(3)}`;
    }
    if (extraArgs.f !== undefined) {
        str += ` F${extraArgs.f.toFixed(0)}`;
    }
    if (i_out !== undefined) str += ` I${i_out.toFixed(3)}`;
    if (j_out !== undefined) str += ` J${j_out.toFixed(3)}`;
    return str + '\n';
}

export function getTextWidth(text, lengthLet, space) {
    let width = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === 'I') {
            width += lengthLet / 2;
        } else {
            width += lengthLet;
        }
        if (i < text.length - 1) {
            width += space;
        }
    }
    return width;
}

export function drawTextString(text, uStart, vStart, lengthLet, hightLet, space, depth, up, orientation, sideways = false) {
    let gcode = '';
    if (sideways) {
        if (orientation === 'Y') {
            const labelWidth = getTextWidth(text, lengthLet, space);
            let currentV = vStart + labelWidth;
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                gcode += drawCharacter(char, uStart, currentV, lengthLet, hightLet, depth, up, orientation, true);
                const charW = (char === 'I' ? lengthLet / 2 : lengthLet);
                currentV -= (charW + space);
            }
        } else {
            let currentV = vStart;
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                gcode += drawCharacter(char, uStart, currentV, lengthLet, hightLet, depth, up, orientation, true);
                const charW = (char === 'I' ? lengthLet / 2 : lengthLet);
                currentV += charW + space;
            }
        }
    } else {
        let currentU = uStart;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            gcode += drawCharacter(char, currentU, vStart, lengthLet, hightLet, depth, up, orientation, false);
            const charW = (char === 'I' ? lengthLet / 2 : lengthLet);
            currentU += charW + space;
        }
    }
    return gcode;
}

export function drawCharacter(char, uStart, vStart, lengthLet, hightLet, depth, up, orientation, sideways = false) {
    let gcode = '';
    const down = depth;
    const rapide = 'G0';
    const lent = 'G01';
    const tourHoraire = 'G02';
    const tourAntihoraire = 'G03';

    const posAct = 0;

    function l(cmd, ...params) {
        let x_raw = 0, y_raw = 0, z = undefined;
        let i_raw = undefined, j_raw = undefined;
        for (let idx = 0; idx < params.length; idx += 2) {
            const axis = params[idx];
            const val = params[idx + 1];
            if (axis === 'X') x_raw = val;
            if (axis === 'Y') y_raw = val;
            if (axis === 'Z') z = val;
            if (axis === 'I') i_raw = val;
            if (axis === 'J') j_raw = val;
        }

        let x_out, y_out;
        let i_out = undefined, j_out = undefined;

        if (orientation === 'X') {
            if (sideways) {
                x_out = uStart + (hightLet / 2) - y_raw;
                y_out = vStart + x_raw;
                if (i_raw !== undefined && j_raw !== undefined) {
                    i_out = -j_raw;
                    j_out = i_raw;
                }
            } else {
                x_out = uStart + x_raw;
                y_out = vStart + y_raw;
                if (i_raw !== undefined && j_raw !== undefined) {
                    i_out = i_raw;
                    j_out = j_raw;
                }
            }
        } else {
            if (sideways) {
                x_out = -vStart + x_raw;
                y_out = uStart - (hightLet / 2) + y_raw;
                if (i_raw !== undefined && j_raw !== undefined) {
                    i_out = i_raw;
                    j_out = j_raw;
                }
            } else {
                x_out = -(vStart + y_raw);
                y_out = uStart + x_raw;
                if (i_raw !== undefined && j_raw !== undefined) {
                    i_out = -j_raw;
                    j_out = i_raw;
                }
            }
        }

        return makeLine(cmd, 'X', x_out, y_out, { z, i: i_out, j: j_out });
    }

    switch (char) {
        case 'A':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', 0, 'Z', up);
            gcode += l(rapide, 'X', posAct + lengthLet / 4, 'Y', hightLet / 2, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet / 4, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet * 3 / 4, 'Y', hightLet / 2, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet * 3 / 4, 'Y', hightLet / 2, 'Z', up);
            break;
        case 'B':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet, 'Z', down);
            gcode += l(tourHoraire, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet / 2, 'I', 0, 'J', -hightLet / 4);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet / 2, 'Z', down);
            gcode += l(tourHoraire, 'X', posAct + lengthLet - hightLet / 4, 'Y', 0, 'I', 0, 'J', -hightLet / 4);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            break;
        case 'C':
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet, 'I', -hightLet / 4, 'J', 0);
            gcode += l(lent, 'X', posAct + hightLet / 4, 'Y', hightLet, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct, 'Y', hightLet * 3 / 4, 'I', 0, 'J', -hightLet / 4);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 4, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + hightLet / 4, 'Y', 0, 'I', hightLet / 4, 'J', 0);
            gcode += l(lent, 'X', posAct + lengthLet - hightLet / 4, 'Y', 0, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + lengthLet, 'Y', hightLet / 4, 'I', 0, 'J', hightLet / 4);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet / 4, 'Z', up);
            break;
        case 'D':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet - hightLet / 2, 'Y', hightLet, 'Z', down);
            gcode += l(tourHoraire, 'X', posAct + lengthLet - hightLet / 2, 'Y', 0, 'I', 0, 'J', -hightLet / 2);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            break;
        case 'E':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet / 2, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', up);
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', 0, 'Z', up);
            break;
        case 'F':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet / 2, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', up);
            break;
        case 'G':
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet, 'I', -hightLet / 4, 'J', 0);
            gcode += l(lent, 'X', posAct + hightLet / 4, 'Y', hightLet, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct, 'Y', hightLet * 3 / 4, 'I', 0, 'J', -hightLet / 4);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 4, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + hightLet / 4, 'Y', 0, 'I', hightLet / 4, 'J', 0);
            gcode += l(lent, 'X', posAct + lengthLet - hightLet / 4, 'Y', 0, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + lengthLet, 'Y', hightLet / 4, 'I', 0, 'J', hightLet / 4);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', hightLet / 2, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet / 2, 'Y', hightLet / 2, 'Z', up);
            break;
        case 'H':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet / 2, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', up);
            break;
        case 'I':
            gcode += l(rapide, 'X', posAct + lengthLet / 4, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet / 4, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 4, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet / 4, 'Y', hightLet, 'Z', up);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet / 2, 'Y', hightLet, 'Z', up);
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet / 2, 'Y', 0, 'Z', up);
            break;
        case 'J':
            gcode += l(rapide, 'X', posAct, 'Y', hightLet / 4, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 4, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + hightLet / 4, 'Y', 0, 'I', hightLet / 4, 'J', 0);
            gcode += l(lent, 'X', posAct + lengthLet - hightLet / 4, 'Y', 0, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + lengthLet, 'Y', hightLet / 4, 'I', 0, 'J', hightLet / 4);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            break;
        case 'K':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet / 2, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet / 2, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', 0, 'Z', up);
            break;
        case 'L':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', 0, 'Z', up);
            break;
        case 'M':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', 0, 'Z', up);
            break;
        case 'N':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            break;
        case 'O':
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet, 'I', -hightLet / 4, 'J', 0);
            gcode += l(lent, 'X', posAct + hightLet / 4, 'Y', hightLet, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct, 'Y', hightLet * 3 / 4, 'I', 0, 'J', -hightLet / 4);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 4, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + hightLet / 4, 'Y', 0, 'I', hightLet / 4, 'J', 0);
            gcode += l(lent, 'X', posAct + lengthLet - hightLet / 4, 'Y', 0, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + lengthLet, 'Y', hightLet / 4, 'I', 0, 'J', hightLet / 4);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', up);
            break;
        case 'P':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet, 'Z', down);
            gcode += l(tourHoraire, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet / 2, 'I', 0, 'J', -hightLet / 4);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet / 2, 'Z', up);
            break;
        case 'Q':
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet, 'I', -hightLet / 4, 'J', 0);
            gcode += l(lent, 'X', posAct + hightLet / 4, 'Y', hightLet, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct, 'Y', hightLet * 3 / 4, 'I', 0, 'J', -hightLet / 4);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 4, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + hightLet / 4, 'Y', 0, 'I', hightLet / 4, 'J', 0);
            gcode += l(lent, 'X', posAct + lengthLet - hightLet / 4, 'Y', 0, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + lengthLet, 'Y', hightLet / 4, 'I', 0, 'J', hightLet / 4);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', up);
            gcode += l(rapide, 'X', posAct + lengthLet / 2, 'Y', hightLet / 2, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', 0, 'Z', up);
            break;
        case 'R':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet, 'Z', down);
            gcode += l(tourHoraire, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet / 2, 'I', 0, 'J', -hightLet / 4);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', 0, 'Z', up);
            break;
        case 'S':
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet, 'I', -hightLet / 4, 'J', 0);
            gcode += l(lent, 'X', posAct + hightLet / 4, 'Y', hightLet, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + hightLet / 4, 'Y', hightLet / 2, 'I', 0, 'J', -hightLet / 4);
            gcode += l(lent, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet / 2, 'Z', down);
            gcode += l(tourHoraire, 'X', posAct + lengthLet - hightLet / 4, 'Y', 0, 'I', 0, 'J', -hightLet / 4);
            gcode += l(lent, 'X', posAct + hightLet / 4, 'Y', 0, 'Z', down);
            gcode += l(tourHoraire, 'X', posAct, 'Y', hightLet / 4, 'I', 0, 'J', hightLet / 4);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet / 4, 'Z', up);
            break;
        case 'T':
            gcode += l(rapide, 'X', posAct + lengthLet / 2, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet / 2, 'Y', hightLet, 'Z', up);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            break;
        case 'U':
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 4, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + hightLet / 4, 'Y', 0, 'I', hightLet / 4, 'J', 0);
            gcode += l(lent, 'X', posAct + lengthLet - hightLet / 4, 'Y', 0, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + lengthLet, 'Y', hightLet / 4, 'I', 0, 'J', hightLet / 4);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            break;
        case 'V':
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            break;
        case 'W':
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 4, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet * 3 / 4, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            break;
        case 'X':
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', 0, 'Z', up);
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            break;
        case 'Y':
            gcode += l(rapide, 'X', posAct + lengthLet / 2, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            gcode += l(rapide, 'X', posAct + lengthLet / 2, 'Y', hightLet / 2, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            break;
        case 'Z':
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            break;
        case '0':
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + lengthLet - hightLet / 4, 'Y', hightLet, 'I', -hightLet / 4, 'J', 0);
            gcode += l(lent, 'X', posAct + hightLet / 4, 'Y', hightLet, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct, 'Y', hightLet * 3 / 4, 'I', 0, 'J', -hightLet / 4);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 4, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + hightLet / 4, 'Y', 0, 'I', hightLet / 4, 'J', 0);
            gcode += l(lent, 'X', posAct + lengthLet - hightLet / 4, 'Y', 0, 'Z', down);
            gcode += l(tourAntihoraire, 'X', posAct + lengthLet, 'Y', hightLet / 4, 'I', 0, 'J', hightLet / 4);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', up);
            break;
        case '1':
            gcode += l(rapide, 'X', posAct, 'Y', hightLet * 3 / 4, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet * 3 / 4, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet / 2, 'Y', 0, 'Z', up);
            break;
        case '2':
            gcode += l(rapide, 'X', posAct, 'Y', hightLet * 3 / 4, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet * 3 / 4, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet * 3 / 4, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', 0, 'Z', up);
            break;
        case '3':
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            break;
        case '4':
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', up);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', 0, 'Z', up);
            break;
        case '5':
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            break;
        case '6':
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet / 2, 'Z', up);
            break;
        case '7':
            gcode += l(rapide, 'X', posAct, 'Y', hightLet, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet / 2, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet / 2, 'Y', 0, 'Z', up);
            break;
        case '8':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', hightLet / 2, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', up);
            break;
        case '9':
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', 0, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet, 'Z', down);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', up);
            break;
        case '.':
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', 0, 'Z', down);
            gcode += l(rapide, 'X', posAct, 'Y', 0, 'Z', up);
            break;
        case '-':
            gcode += l(rapide, 'X', posAct, 'Y', hightLet / 2, 'Z', up);
            gcode += l(lent, 'X', posAct, 'Y', hightLet / 2, 'Z', down);
            gcode += l(lent, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', down);
            gcode += l(rapide, 'X', posAct + lengthLet, 'Y', hightLet / 2, 'Z', up);
            break;
    }
    return gcode;
}
