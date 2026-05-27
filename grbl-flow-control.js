export class GrblFlowControl {
    constructor(transport) {
        this.transport = transport;
        this.encoder = new TextEncoder();
        this.rxBufSize = 128;
        this.sentBuffer = [];
    }

    reset() {
        this.sentBuffer = [];
    }

    bufferSpace() {
        let total = 0;
        for (let i = 0; i < this.sentBuffer.length; i++) {
            total += this.sentBuffer[i].length;
        }
        return (this.rxBufSize - 1) - total;
    }

    canSend(line) {
        const bs = this.bufferSpace();
        const ok = line.length < bs;
        console.log(`fc canSend len=${line.length} bs=${bs} bufLen=${this.sentBuffer.length} ok=${ok}`);
        return ok;
    }

    isDrained() {
        return this.sentBuffer.length === 0;
    }

    sendCommand(line) {
        const bytes = this.encoder.encode(line + '\n');
        this.sentBuffer.push(line);
        const totalChars = this.sentBuffer.reduce((s,l)=>s+l.length,0);
        console.log(`fc sendCommand line="${line}" bufLen=${this.sentBuffer.length} totalChars=${totalChars}`);
        try {
            this.transport.writeRaw(bytes);
        } catch (e) {
            console.error(`fc ERROR in writeRaw:`, e);
        }
    }

    processLine(line) {
        if (line === 'ok' || line.startsWith('error:') || line.startsWith('alarm:')) {
            if (this.sentBuffer.length === 0) {
                console.warn(`fc processLine underflow: line="${line}" bufLen=0`);
                return;
            }
            const removed = this.sentBuffer.shift();
            if (line.startsWith('error:')) {
                console.warn(`fc processLine ERROR: line="${line}" removed="${removed}" bufLen=${this.sentBuffer.length}`);
            }
        }
    }
}
