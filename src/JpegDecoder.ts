import { ByteReader } from "./ByteReader";
import { RawImage } from "./RawImage";

const enum Markers {
    START = 0xFF,
    SOI = 0xD8,
    COM = 0xFE,
    APPMIN = 0xE0,
    APPMAX = 0xEF,
    SOF0 = 0xC0,
    DQT = 0xDB,
    DHT = 0xC4,
    SOS = 0xDA,
    EOI = 0xD9
}


class JpegDecoder {

    private reader : ByteReader;
    private decodedData : RawImage;

    private concatenateBytes(high : uint8, low : uint8) : i32 {
        let ret : i32 = high;
        ret <<= 8;
        ret |= low;
        return ret;
    }

    private skipSection() : void {
        let buffer : Uint8Array = new Uint8Array(2);
        this.reader.readBytes(buffer, 2);
        let sectionLength : i32 = this.concatenateBytes(buffer[0], buffer[1]);
        this.reader.skip(sectionLength - 2);
    }

    private readComment() : void {
        let buffer : Uint8Array = new Uint8Array(2);
        this.reader.readBytes(buffer, 2);
        let sectionLength : i32 = this.concatenateBytes(buffer[0], buffer[1]);
        sectionLength -= 2;
        if(sectionLength < 0) {
            unreachable();
        }
        let comment : Uint8Array = new Uint8Array(sectionLength);
        this.reader.readBytes(comment, sectionLength);
        this.decodedData.comment = comment;
    }

    private parse() : void {
        let buffer: Uint8Array = new Uint8Array(2);

        this.reader.readBytes(buffer, 2);
        if(buffer[0] != Markers.START || buffer[1] != Markers.SOI) {
            unreachable();
        }

        let eoi : bool = false;
        while(!eoi) {
            this.reader.readBytes(buffer, 2);
            if(buffer[0] != Markers.START){
                unreachable();
            }
            if(Markers.APPMIN <= buffer[1] && buffer[1] <= Markers.APPMAX){
                this.skipSection();
                continue;
            }

            switch (buffer[1]) {
                case Markers.COM:
                    this.readComment();
                    break;
                case Markers.SOF0:

                    break;
                case Markers.DQT:
                    break;
                case Markers.DHT:
                    break;
                case Markers.SOS:
                    break;
                case Markers.EOI:
                    eoi = true;
                    break;
                default:
                    unreachable();
            }
        }


    }

    decode(data: Uint8Array) : RawImage {
        this.decodedData = new RawImage();
        this.reader = new ByteReader(data);
        this.parse();

        return this.decodedData;
    }

}