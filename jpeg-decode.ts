
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

class ChainedListInt32 {
    id: u32;
    data: Int32Array;
    prev: ChainedListInt32 | null = null;
}

class ChainedListU8 {
    id: u32;
    data: Uint8Array;
    prev: ChainedListU8 | null = null;
}

class ImageComponent {
    lines: Uint8Array;
    scaleX: f32;
    scaleY: f32;
    prev: ImageComponent | null = null;
}

class FrameComponent {
    componentId : u8;
    h : u8;
    v : u8;
    blocks : Int32Array;
    blocksPerLine : i32;
    blocksPerColumn : i32;
    quantizationIdx : u8;
    huffmanTableDC : ChainedListU8;
    huffmanTableAC : ChainedListU8;
    quantizationTable: Int32Array;
    pred : i32;
    prev : FrameComponent | null = null;
}

class Frame {
    extended : bool;
    progressive : bool;
    precision : u8;
    scanLines : u16;
    maxH : f32;
    maxV : f32;
    mcusPerLine : i32;
    mcusPerColumn : i32;
    samplesPerLine : u16;
    components : FrameComponent;
    prev: Frame | null = null;
}

class HuffmanTableChain {
    prev : HuffmanTableChain | null = null;
    children : Uint8Array = new Uint8Array(255);
    index : i32 = 0;
}

let inputStartPointer: usize;
let inputSize: i32;
let resultSize: i32 = 100;
let imageWidth : u16;
let imageHeight : u16;
let imageJfif : Jfif;
let imageAdobe : Adobe;
let imageComponents : ImageComponent | null = null;

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


function prepareComponents(frame : Frame) : void {
    let maxH : f32 = 0;
    let maxV : f32 = 0;
    let currentCP : FrameComponent | null = frame.components;
    while (currentCP != null) {
        if (maxH < currentCP.h) {
            maxH = currentCP.h;
        }
        if (maxV < currentCP.v) {
           maxV = currentCP.v; 
        }
        currentCP = currentCP.prev;
    }
    let mcusPerLine : f32 = ceilf(frame.samplesPerLine / 8 / maxH);
    let mcusPerColumn : f32 = ceilf(frame.scanLines / 8 / maxV);

    currentCP = frame.components;
    while (currentCP != null) {
        
        let blocksPerLine : f32 = ceilf(ceilf(frame.samplesPerLine / 8) * currentCP.h / maxH);
        let blocksPerColumn : f32 = ceilf(ceilf(frame.scanLines  / 8) * currentCP.v / maxV);
        let blocksPerLineForMcu : i32 = (mcusPerLine as i32) * (currentCP.h as i32);
        let blocksPerColumnForMcu : i32 = (mcusPerColumn as i32) * (currentCP.v as i32);
        currentCP.blocksPerLine = blocksPerLine as i32;
        currentCP.blocksPerColumn = blocksPerColumn as i32;
        currentCP.blocks = new Int32Array(64*blocksPerLineForMcu*blocksPerColumnForMcu);
        currentCP = currentCP.prev;
    }
    frame.maxH = maxH;
    frame.maxV = maxV;
    frame.mcusPerLine = mcusPerLine as i32;
    frame.mcusPerColumn = mcusPerColumn as i32;
}

function buildHuffmanTable(codeLengths : Uint8Array, values : Uint8Array) : Uint8Array {
    let k : u16 = 0, i : u16, j : u16; 
    let length : u16 = 16;
    while (length > 0 && !codeLengths[length - 1]) {
        length--;
    }

    let children : Uint8Array
      
    let code : HuffmanTableChain | null = new HuffmanTableChain();
    let p : HuffmanTableChain = code; 
    let q : HuffmanTableChain;
    let codeLength : u8 = 1;
    for (i = 0; i < length; i++) {
        for (j = 0; j < codeLengths[i]; j++) {
            p = code;
            if(code.prev != null){
                code = code.prev;
            }
            codeLength--;
            p.prev = null;
            p.children[p.index] = values[k];
            while (p.index > 0) {
                p = code;
                if(code.prev != null){
                    code = code.prev;
                }
                codeLength--;
            }
            p.index += 1;
            p.prev = code;
            code = p;
            codeLength++;
            while (codeLength <= i) {
                q = new HuffmanTableChain();
                q.prev = code;
                code = q;
                p.children[p.index] = 0; // possible wrong value
                p = q;
                codeLength++;
            }
            k++;
        }
        if (i + 1 < length) {
            // p here points to last code
            q = new HuffmanTableChain();
            q.prev = code;
            code = q;
            codeLength++;
            p.children[p.index] = 0; // possible wrong value
            p = q;
        }
    }
    return code.children;
}

function getFrameComponentAtIndex(list : FrameComponent, index : u8) : FrameComponent | null {
    let current : FrameComponent | null = list;
    let i : u16 = 0;
    while(current != null && index > i) {
        current = current.prev;    
    }
    return current;
}

function findInU8ChainedListById(list : ChainedListU8, id : i32) : ChainedListU8 | null {
    let current : ChainedListU8 | null = list;
    while(current != null && current.id != id) {
        current = current.prev;    
    }
    return current;
}

function findInI32ChainedListById(list : ChainedListInt32, id : i32) : ChainedListInt32 | null {
    let current : ChainedListInt32 | null = list;
    while(current != null && current.id != id) {
        current = current.prev;    
    }
    return current;
}

function decodeACFirst(component : FrameComponent, zz : i32) : void {
}

function decodeACSuccessive(component : FrameComponent, zz : i32) : void {
}

function decodeDCFirst(component : FrameComponent, zz : i32) : void {
}

function decodeDCSuccessive(component : FrameComponent, zz : i32) : void {
}

function decodeBaseline(component : FrameComponent, zz : i32) : void {
}


function decodeBlock(component : FrameComponent, decodeFn : string, mcu : i32) : void {
    let blockRow : i32 = (mcu / component.blocksPerLine) | 0;
    let blockCol : i32 = mcu % component.blocksPerLine;
    let blockIndex : i32 = 64*blockRow + blockCol;
    switch(decodeFn) {
        case 'decodeACFirst':
            decodeACFirst(component, component.blocks[blockIndex]);
        break;
        case 'decodeACSuccessive':
            decodeACSuccessive(component, component.blocks[blockIndex]);
        break;
        case 'decodeDCFirst':
            decodeDCFirst(component, component.blocks[blockIndex]);
        break;
        case 'decodeDCSuccessive':
            decodeDCSuccessive(component, component.blocks[blockIndex]);
        break;
        case 'decodeBaseline':
            decodeBaseline(component, component.blocks[blockIndex]);
        break;
    }
}

function decodeMcu(component : FrameComponent, decodeFn : string, mcu : i32, col : i32, row : i32,
    mcusPerLine : i32) : void {
    let mcuRow : i32 = (mcu / mcusPerLine) | 0;
    let mcuCol : i32 = mcu % mcusPerLine;
    let blockRow : i32 = mcuRow * component.v + row;
    let blockCol : i32 = mcuCol * component.h + col;

    let blockIndex : i32 = 64*blockRow + blockCol;
    switch(decodeFn) {
        case 'decodeACFirst':
            decodeACFirst(component, component.blocks[blockIndex]);
        break;
        case 'decodeACSuccessive':
            decodeACSuccessive(component, component.blocks[blockIndex]);
        break;
        case 'decodeDCFirst':
            decodeDCFirst(component, component.blocks[blockIndex]);
        break;
        case 'decodeDCSuccessive':
            decodeDCSuccessive(component, component.blocks[blockIndex]);
        break;
        case 'decodeBaseline':
            decodeBaseline(component, component.blocks[blockIndex]);
        break;
    }
}

function decodeScan(data : Uint8Array, offset : i32, frame : Frame, components : FrameComponent, 
    resetInterval : i32, spectralStart : u8, spectralEnd : u8,
    successivePrev : i32, successive : i32) : i32 {
    let precision : u8 = frame.precision;
    let samplesPerLine : u16 = frame.samplesPerLine;
    let scanLines : u16 = frame.scanLines;
    let mcusPerLine : i32 = frame.mcusPerLine;
    let progressive : bool = frame.progressive;
    let maxH : f32 = frame.maxH;
    let maxV : f32 = frame.maxV;
    let startOffset : i32 = offset;
    let bitsData : i32 = 0;
    let bitsCount : i32 = 0;
    let eobrun : i32 = 0;
    let successiveACState : i32 = 0;
    let successiveACNextValue : i32 = 0;
    let component : FrameComponent | null, i : i32, j : i32, k : i32, n : i32;
    let decodeFn : string;
    let h : u8, v : u8;
    let mcu : i32 = 0, marker : i32;
    let mcuExpected : i32;

    if (progressive) {
      if (spectralStart == 0)
        decodeFn = successivePrev == 0 ? 'decodeDCFirst' : 'decodeDCSuccessive';
      else
        decodeFn = successivePrev == 0 ? 'decodeACFirst' : 'decodeACSuccessive';
    } else {
      decodeFn = 'decodeBaseline';
    }

    if (components.prev == null) {
      mcuExpected = components.blocksPerLine * components.blocksPerColumn;
    } else {
      mcuExpected = mcusPerLine * frame.mcusPerColumn;
    }

    if (!resetInterval) {
        resetInterval = mcuExpected;
    }

    while (mcu < mcuExpected) {
      // reset interval stuff
        let currentComponent : FrameComponent | null = components;
        while (currentComponent != null) {
            currentComponent.pred = 0;
            currentComponent = currentComponent.prev;
        }
        eobrun = 0;

        if (components.prev != null) {
            component = components;
            for (n = 0; n < resetInterval; n++) {
                decodeBlock(component, decodeFn, mcu);
                mcu++;
            }
        } else {
            for (n = 0; n < resetInterval; n++) {
                component = components;
                while (component != null) {
                    h = component.h;
                    v = component.v;
                    for (j = 0; j < v; j++) {
                        for (k = 0; k < h; k++) {
                            decodeMcu(component, decodeFn, mcu, j, k, mcusPerLine);
                        }
                    }
                    component = component.prev;
                }
                mcu++;

                // If we've reached our expected MCU's, stop decoding
                if (mcu == mcuExpected) {
                    break;
                }
            }
        }

        // find marker
        bitsCount = 0;
        marker = (data[offset] << 8) | data[offset + 1];
        if (marker < 0xFF00) {
            unreachable();
        }

        if (marker >= 0xFFD0 && marker <= 0xFFD7) { // RSTx
            offset += 2;
        }
        else
            break;
    }

    return offset - startOffset;
}

function buildComponentData(frame : Frame, component : FrameComponent) : Uint8Array {
    // TODO Implement
    return new Uint8Array(1);
}

export function parse(data : Uint8Array) : void {
    let jfif : Jfif = new Jfif();
    let adobe : Adobe = new Adobe();
    let frame : Frame = new Frame();
    let frames : Frame | null = null;
    let offset : i32 = 0;
    let resetInterval : u16 = 0;
    let length : i32 = inputSize;
    let fileMarker: i16 = readUint16(data, offset);
    let quantizationTables : ChainedListInt32 | null = null;
    let huffmanTablesAC : ChainedListU8 | null = null;
    let huffmanTablesDC : ChainedListU8 | null = null;
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

                if (fileMarker == 0xFFE0) {
                    if (appData[0] == 0x4A && appData[1] == 0x46 && appData[2] == 0x49 &&
                    appData[3] == 0x46 && appData[4] == 0) { // 'JFIF\x00'
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
                // TODO APP1 - Exif
                if (fileMarker == 0xFFEE) {
                    if (appData[0] == 0x41 && appData[1] == 0x64 && appData[2] == 0x6F &&
                    appData[3] == 0x62 && appData[4] == 0x65 && appData[5] == 0) { // 'Adobe\x00'
                        adobe.version = appData[6];
                        adobe.flags0 = (appData[7] << 8) | appData[8];
                        adobe.flags1 = (appData[9] << 8) | appData[10];
                        adobe.transformCode = appData[11];
                    }
                }
                break;
  
            case 0xFFDB: // DQT (Define Quantization Tables)
                let quantizationTablesLength : u16 = readUint16(data, offset);
                offset += 2;
                let quantizationTablesEnd : u32 = quantizationTablesLength + offset - 2;
                while (offset < quantizationTablesEnd) {
                    let quantizationTableSpec : u8 = data[offset];
                    offset++;
                    let tableData : Int32Array = new Int32Array(64);
                    if ((quantizationTableSpec >> 4) == 0) { // 8 bit values
                    for (j = 0; j < 64; j++) {
                        let z : i32 = dctZigZag[j];
                        tableData[z] = data[offset];
                        offset++;
                    }
                    } else if ((quantizationTableSpec >> 4) == 1) { //16 bit
                    for (j = 0; j < 64; j++) {
                        let z : i32 = dctZigZag[j];
                        tableData[z] = readUint16(data, offset);
                        offset += 2;
                    }
                    } else {
                        unreachable();
                    }
                    let table : ChainedListInt32 = new ChainedListInt32();
                    table.data = tableData;
                    table.id = quantizationTableSpec & 15;
                    table.prev = quantizationTables;
                    quantizationTables = table; 
                }
                break;
  
            case 0xFFC0: // SOF0 (Start of Frame, Baseline DCT)
            case 0xFFC1: // SOF1 (Start of Frame, Extended DCT)
            case 0xFFC2: // SOF2 (Start of Frame, Progressive DCT)
                readUint16(data, offset); // skip data length
                offset += 2;
                frame = new Frame();
                frame.extended = (fileMarker == 0xFFC1);
                frame.progressive = (fileMarker == 0xFFC2);
                frame.precision = data[offset];
                offset++;
                frame.scanLines = readUint16(data, offset);
                offset += 2;
                frame.samplesPerLine = readUint16(data, offset);
                offset += 2;

                let componentsCount : u8 = data[offset++], componentId : u8;
                frame.components = new FrameComponent();
                for (i = 0; i < componentsCount; i++) {
                    componentId = data[offset];
                    let h : u8 = data[offset + 1] >> 4;
                    let v : u8 = data[offset + 1] & 15;
                    let qId : u8 = data[offset + 2];

                    let fc : FrameComponent = new FrameComponent();
                    fc.h = h;
                    fc.v = v;
                    fc.quantizationIdx = qId;
                    fc.componentId = componentId;
                    fc.prev = frame.components;
                
                    frame.components = fc;
                    offset += 3;
                }
                prepareComponents(frame);
                if(frames != null) {
                    frame.prev = frames;
                }
                frames = frame;
                break;
            case 0xFFC4: // DHT (Define Huffman Tables)
                let huffmanLength : u16 = readUint16(data, offset);
                offset += 2;
                for (i = 2; i < huffmanLength;) {
                    let huffmanTableSpec : u8 = data[offset];
                    offset++;
                    let codeLengths : Uint8Array = new Uint8Array(16);
                    let codeLengthSum : i32 = 0;
                    for (j = 0; j < 16; j++) {
                        codeLengths[j] = data[offset];
                        codeLengthSum += codeLengths[j];
                        offset++;
                    }
                    let huffmanValues : Uint8Array = new Uint8Array(codeLengthSum);
                    for (j = 0; j < codeLengthSum; j++) {
                        huffmanValues[j] = data[offset];
                        offset++;
                    }
                    i += 17 + codeLengthSum;
        
                    let huffmanTable : Uint8Array = buildHuffmanTable(codeLengths, huffmanValues);
                    let huffmanChainItem : ChainedListU8 = new ChainedListU8();
                    huffmanChainItem.data = huffmanTable;
                    if((huffmanTableSpec >> 4) == 0){
                        huffmanChainItem.prev = huffmanTablesDC;
                        huffmanChainItem.id = huffmanTableSpec & 15;
                        huffmanTablesDC = huffmanChainItem;
                    }
                    else {                        
                        huffmanChainItem.prev = huffmanTablesAC;
                        huffmanChainItem.id = huffmanTableSpec & 15;
                        huffmanTablesAC = huffmanChainItem;
                    }
                }
                break;
            case 0xFFDD: // DRI (Define Restart Interval)
                readUint16(data, offset); // skip data length
                offset += 2;
                resetInterval = readUint16(data, offset);
                offset += 2;
                break;
            case 0xFFDA: // SOS (Start of Scan)
                let scanLength : u16 = readUint16(data, offset);
                offset += 2;
                let selectorsCount : u8 = data[offset];
                offset++;
                for (i = 0; i < selectorsCount; i++) {
                    let component : FrameComponent = getFrameComponentAtIndex(frame.components, data[offset]);
                    offset++;
                    let tableSpec : u8 = data[offset++];
                    component.huffmanTableDC = findInU8ChainedListById(huffmanTablesDC, tableSpec >> 4);
                    component.huffmanTableAC = findInU8ChainedListById(huffmanTablesAC, tableSpec & 15);
                }
                let spectralStart : u8 = data[offset];
                offset++;
                let spectralEnd : u8 = data[offset];
                offset++;
                let successiveApproximation : u8 = data[offset];
                offset++;
                let processed : i32 = decodeScan(data, offset,
                  frame, frame.components, resetInterval,
                  spectralStart, spectralEnd,
                  successiveApproximation >> 4, successiveApproximation & 15);
               
                  offset += processed;
                break;
            default:
                if (data[offset - 3] == 0xFF &&
                    data[offset - 2] >= 0xC0 && data[offset - 2] <= 0xFE) {
                  // could be incorrect encoding -- last 0xFF byte of the previous
                  // block was eaten by the encoder
                  offset -= 3;
                  break;
                }
                unreachable();
        }
        fileMarker = readUint16(data, offset);
        offset += 2;
    }
    if(frames == null) {
        unreachable();
    }
    // set each frame's components quantization table
    let currentFrame : Frame | null = frames;
    while (currentFrame != null) {
        let cp : FrameComponent = currentFrame.components;
        let currentCP : FrameComponent | null = cp;
        while (currentCP != null) {
            let quantizationTable : ChainedListInt32 = findInI32ChainedListById(quantizationTables, currentCP.quantizationIdx);
            currentCP.quantizationTable = quantizationTable.data;
            currentCP = currentCP.prev;
        }
        currentFrame = currentFrame.prev;
    }

    imageWidth = frame.samplesPerLine;
    imageHeight = frame.scanLines;
    imageJfif = jfif;
    imageAdobe = adobe;

    let currentCP : FrameComponent | null = frame.components;
    while (currentCP != null) {
        let newComponent : ImageComponent = new ImageComponent();
        newComponent.scaleX = currentCP.h / frame.maxH;
        newComponent.scaleY = currentCP.v / frame.maxV;
        newComponent.lines = buildComponentData(frame, currentCP);
        if(imageComponents != null) {
            newComponent.prev = imageComponents;
        }
        imageComponents = newComponent;
        currentCP = currentCP.prev;
    }
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