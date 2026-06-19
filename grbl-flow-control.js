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
        return line.length < this.bufferSpace();
    }

    isDrained() {
        return this.sentBuffer.length === 0;
    }

    sendCommand(line) {
        const bytes = this.encoder.encode(line + '\n');
        this.sentBuffer.push(line);
        try {
            this.transport.writeRaw(bytes);
        } catch (e) {
            console.error('GrblFlowControl: writeRaw error:', e);
        }
    }

    processLine(line) {
        if (line === 'ok' || line.startsWith('error:') || line.startsWith('alarm:')) {
            if (this.sentBuffer.length === 0) {
                console.warn(`fc underflow: line="${line}" bufLen=0`);
                return;
            }
            this.sentBuffer.shift();
        }
    }
}
