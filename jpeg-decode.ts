let inputStartPointer: usize;
let inputSize: i32;
let resultSize: i32 = 100;
const dctZigZag : i32[] = [
    0,
    1,  8,
    16,  9,  2,
    3, 10, 17, 24,
    32, 25, 18, 11, 4,
    5, 12, 19, 26, 33, 40,
    48, 41, 34, 27, 20, 13,  6,
    7, 14, 21, 28, 35, 42, 49, 56,
    57, 50, 43, 36, 29, 22, 15,
    23, 30, 37, 44, 51, 58,
    59, 52, 45, 38, 31,
    39, 46, 53, 60,
    61, 54, 47,
    55, 62,
    63
];
var dctCos1 : u32  =  4017   // cos(pi/16)
var dctSin1 : u32  =   799   // sin(pi/16)
var dctCos3 : u32  =  3406   // cos(3*pi/16)
var dctSin3 : u32  =  2276   // sin(3*pi/16)
var dctCos6 : u32  =  1567   // cos(6*pi/16)
var dctSin6 : u32  =  3784   // sin(6*pi/16)
var dctSqrt2 : u32 =  5793   // sqrt(2)
var dctSqrt1d2 : u32 = 2896  // sqrt(2) / 2

function sliceUint8Array (array : Uint8Array, offset: i32, length: i32) : Uint8Array {
    let result : Uint8Array = new Uint8Array(length);
    for(let i : i32 = 0; i < offset + length; i++) {
        if(offset + i >= array.length) {
            break;
        }
        result[i] = array[offset+i];
    }

    return result;
}

function generateResult() : usize {
    let resultPosition : usize = malloc(resultSize);
    let arr : Uint8Array = new Uint8Array(resultSize);
    for(let i : i32 = 0; i < resultSize; i++) {
        let currentByte : u8 = load<u8>(inputStartPointer+i);
        //currentByte++;
        arr[i] = currentByte;
        //store<u8>(resultPosition+i, currentByte);
    }
    let newArr : Uint8Array = new Uint8Array(resultSize);
    newArr = incArray(arr);
    for(let i : i32 = 0; i < resultSize; i++) {
        store<u8>(resultPosition + i, newArr[i]);
    }
    return resultPosition;
}

export function readUint16(data : Uint8Array, offset : i32) : u16 {
    let value : u16 = (data[offset] << 8) | data[offset + 1];
    return value;
} // !!!! increment offset by 2 after call

export function readDataBlock(data : Uint8Array, offset : i32) : Uint8Array {
    let length : i32  = readUint16(data, offset) as i32;
    let array : Uint8Array =sliceUint8Array(data, offset, length - 2);
    return array;
} // !!!! increment offset with lenght after call


class Jfif {
    majorVersion: u8;
    minorVersion: u8;
    densityUnits: u8;
    xDensity: u16;
    yDensity: u16;
    thumbWidth: u8;
    thumbHeight: u8;
    thumbData: Uint8Array;
}

class Adobe {
    version : u8;
    flags0 : u16;
    flags1 : u16;
    transformCode : u8;
}

class Frame {
    extended : bool;
    progressive : bool;
    precision : u8;
    scanLines : u16;
    samplesPerLine : u16;
    components: Uint8Array;
    componentsOrder: Uint8Array;
}

export function parse(data : Uint8Array) : void {
    let jfif : Jfif = new Jfif();
    let adobe : Adobe = new Adobe();
    let frame : Frame;
    let offset : i32 = 0;
    let length : i32 = inputSize;
    let fileMarker: i16 = readUint16(data, offset);
    let quantizationTables : i32[][];
    offset += 2;
    if(fileMarker != 0xFFD8) {
        unreachable();
    }

    fileMarker = readUint16(data, offset);
    while(fileMarker != 0xFFD9) {
        let i : i32, j : i32, l : i32;
        switch(fileMarker) {
            case 0xFF00: break;
            case 0xFFE0: // APP0 (Application Specific)
            case 0xFFE1: // APP1
            case 0xFFE2: // APP2
            case 0xFFE3: // APP3
            case 0xFFE4: // APP4
            case 0xFFE5: // APP5
            case 0xFFE6: // APP6
            case 0xFFE7: // APP7
            case 0xFFE8: // APP8
            case 0xFFE9: // APP9
            case 0xFFEA: // APP10
            case 0xFFEB: // APP11
            case 0xFFEC: // APP12
            case 0xFFED: // APP13
            case 0xFFEE: // APP14
            case 0xFFEF: // APP15
            case 0xFFFE: // COM (Comment)
                let appData : Uint8Array = readDataBlock(data, offset);
                offset += appData.length;

                if (fileMarker === 0xFFE0) {
                    if (appData[0] === 0x4A && appData[1] === 0x46 && appData[2] === 0x49 &&
                    appData[3] === 0x46 && appData[4] === 0) { // 'JFIF\x00'
                        jfif.majorVersion = appData[5];
                        jfif.minorVersion = appData[6];
                        jfif.densityUnits = appData[7];
                        jfif.xDensity = (appData[8] << 8) | appData[9];
                        jfif.yDensity = (appData[10] << 8) | appData[11];
                        jfif.thumbWidth = appData[12];
                        jfif.thumbHeight = appData[13];
                        jfif.thumbData = sliceUint8Array(appData, 14, 3 * appData[12] * appData[13]);
                    }
                }
            
        }
    }
    fileMarker = readUint16(data, offset);
    offset += 2;
}

export function getResultSize() : i32 {
    return resultSize;
}

export function getInOffset(size: i32) : usize {
    inputSize = size;
    inputStartPointer = malloc(size);
    return inputStartPointer;
}

export function jpeg_decode() : usize {
    return generateResult();
}

function incArray(arr: Uint8Array) : Uint8Array {
    let newArr : Uint8Array = new Uint8Array(resultSize);
    for(let i: i8 = 0; i < arr.length; i++) {
        newArr[i] = arr[i] + 1;
    }
    return newArr;
}