export class ByteReader {

    private data: Uint8Array;
    private carret: i32 = 0;

    constructor(bytes: Uint8Array) {
        this.data = bytes;
    }

    skip(size: i32): void {
        if (this.carret + size >= this.data.length) {
            unreachable();
        }
        this.carret += size;
    }

    readBytes(buffer: Uint8Array, size: i32): void {
        if (this.carret + size >= this.data.length) {
            unreachable();
        }
        for (let i: i32 = 0; i < size; i++) {
            buffer[i] = this.data[this.carret + i];
        }
        this.carret += size;
    }

}