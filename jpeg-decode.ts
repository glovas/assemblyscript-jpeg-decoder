let inBytes: usize;
let bytesSize: i32;
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

function generateResult() : usize {
    let resultPosition : usize = malloc(resultSize);
    for(let i : i32 = 0; i < resultSize; i++) {
        let currentByte : u8 = load<u8>(inBytes+i);
        currentByte++;
        store<u8>(resultPosition+i, currentByte);
    }
    return resultPosition;
}

export function getResultSize() : i32 {
    return resultSize;
}

export function getInOffset(size: i32) : usize {
    bytesSize = size;
    inBytes = malloc(size);
    return inBytes;
}

export function jpeg_decode() : usize {
    return generateResult();
}