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
    for(let i : i32 = 0; i < resultSize; i++) {
        let currentByte : u8 = load<u8>(inputStartPointer+i);
        currentByte++;
        store<u8>(resultPosition+i, currentByte);
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