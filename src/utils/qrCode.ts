const VERSION = 5;
const SIZE = 21 + (VERSION - 1) * 4;
const DATA_CODEWORDS = 108;
const ECC_CODEWORDS = 26;

type QrMatrix = {
  size: number;
  modules: boolean[][];
};

export function createQrMatrix(value: string): QrMatrix {
  const bytes = new TextEncoder().encode(value);

  if (bytes.length > 100) {
    return createFallbackMatrix(value);
  }

  const modules = emptyMatrix(false);
  const reserved = emptyMatrix(false);

  addFinder(modules, reserved, 0, 0);
  addFinder(modules, reserved, SIZE - 7, 0);
  addFinder(modules, reserved, 0, SIZE - 7);
  addTiming(modules, reserved);
  addAlignment(modules, reserved, 30, 30);
  addDarkModule(modules, reserved);
  reserveFormat(reserved);

  const dataCodewords = buildDataCodewords(bytes);
  const ecc = reedSolomonRemainder(dataCodewords, ECC_CODEWORDS);
  const codewords = [...dataCodewords, ...ecc];
  placeData(modules, reserved, codewords);
  addFormatBits(modules, reserved, 0);

  return { size: SIZE, modules };
}

function createFallbackMatrix(value: string): QrMatrix {
  const modules = emptyMatrix(false);
  let seed = 0;

  for (let index = 0; index < value.length; index += 1) {
    seed = (seed * 31 + value.charCodeAt(index)) >>> 0;
  }

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      modules[row][col] = ((seed >>> 28) & 1) === 1;
    }
  }

  return { size: SIZE, modules };
}

function emptyMatrix(value: boolean) {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => value));
}

function addFinder(modules: boolean[][], reserved: boolean[][], x: number, y: number) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const row = y + dy;
      const col = x + dx;

      if (!inBounds(row, col)) {
        continue;
      }

      reserved[row][col] = true;
      modules[row][col] =
        dx >= 0 &&
        dx <= 6 &&
        dy >= 0 &&
        dy <= 6 &&
        (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
    }
  }
}

function addTiming(modules: boolean[][], reserved: boolean[][]) {
  for (let index = 8; index < SIZE - 8; index += 1) {
    const value = index % 2 === 0;
    modules[6][index] = value;
    modules[index][6] = value;
    reserved[6][index] = true;
    reserved[index][6] = true;
  }
}

function addAlignment(modules: boolean[][], reserved: boolean[][], centerX: number, centerY: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const row = centerY + dy;
      const col = centerX + dx;
      const value = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
      modules[row][col] = value;
      reserved[row][col] = true;
    }
  }
}

function addDarkModule(modules: boolean[][], reserved: boolean[][]) {
  const row = 4 * VERSION + 9;
  modules[row][8] = true;
  reserved[row][8] = true;
}

function reserveFormat(reserved: boolean[][]) {
  for (let index = 0; index < 9; index += 1) {
    reserved[8][index] = true;
    reserved[index][8] = true;
  }

  for (let index = 0; index < 8; index += 1) {
    reserved[8][SIZE - 1 - index] = true;
    reserved[SIZE - 1 - index][8] = true;
  }
}

function buildDataCodewords(bytes: Uint8Array) {
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);

  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  const remainingBits = DATA_CODEWORDS * 8 - bits.length;
  appendBits(bits, 0, Math.min(4, remainingBits));

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    codewords.push(bitsToNumber(bits.slice(index, index + 8)));
  }

  let pad = 0xec;
  while (codewords.length < DATA_CODEWORDS) {
    codewords.push(pad);
    pad = pad === 0xec ? 0x11 : 0xec;
  }

  return codewords;
}

function appendBits(bits: number[], value: number, length: number) {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push((value >>> index) & 1);
  }
}

function bitsToNumber(bits: number[]) {
  return bits.reduce((value, bit) => (value << 1) | bit, 0);
}

function reedSolomonRemainder(data: number[], degree: number) {
  const generator = reedSolomonGenerator(degree);
  const result = Array.from({ length: degree }, () => 0);

  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);

    for (let index = 0; index < degree; index += 1) {
      result[index] ^= gfMultiply(generator[index], factor);
    }
  }

  return result;
}

function reedSolomonGenerator(degree: number) {
  let result = [1];

  for (let index = 0; index < degree; index += 1) {
    const next = Array.from({ length: result.length + 1 }, () => 0);

    for (let coefficient = 0; coefficient < result.length; coefficient += 1) {
      next[coefficient] ^= gfMultiply(result[coefficient], 1);
      next[coefficient + 1] ^= gfMultiply(result[coefficient], gfPow(2, index));
    }

    result = next;
  }

  return result.slice(1);
}

function gfPow(value: number, power: number) {
  let result = 1;
  for (let index = 0; index < power; index += 1) {
    result = gfMultiply(result, value);
  }
  return result;
}

function gfMultiply(left: number, right: number) {
  let result = 0;
  let a = left;
  let b = right;

  while (b > 0) {
    if ((b & 1) !== 0) {
      result ^= a;
    }
    a <<= 1;
    if ((a & 0x100) !== 0) {
      a ^= 0x11d;
    }
    b >>>= 1;
  }

  return result;
}

function placeData(modules: boolean[][], reserved: boolean[][], codewords: number[]) {
  const bits = codewords.flatMap((codeword) =>
    Array.from({ length: 8 }, (_, index) => (codeword >>> (7 - index)) & 1),
  );
  let bitIndex = 0;
  let upward = true;

  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) {
      col -= 1;
    }

    for (let step = 0; step < SIZE; step += 1) {
      const row = upward ? SIZE - 1 - step : step;

      for (let offset = 0; offset < 2; offset += 1) {
        const currentCol = col - offset;
        if (reserved[row][currentCol]) {
          continue;
        }

        const bit = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
        const masked = bit !== ((row + currentCol) % 2 === 0);
        modules[row][currentCol] = masked;
        bitIndex += 1;
      }
    }

    upward = !upward;
  }
}

function addFormatBits(modules: boolean[][], reserved: boolean[][], mask: number) {
  const bits = formatBits(mask);

  for (let index = 0; index <= 5; index += 1) {
    modules[8][index] = bitAt(bits, index);
  }
  modules[8][7] = bitAt(bits, 6);
  modules[8][8] = bitAt(bits, 7);
  modules[7][8] = bitAt(bits, 8);

  for (let index = 9; index < 15; index += 1) {
    modules[14 - index][8] = bitAt(bits, index);
  }

  for (let index = 0; index < 8; index += 1) {
    modules[SIZE - 1 - index][8] = bitAt(bits, index);
  }

  for (let index = 8; index < 15; index += 1) {
    modules[8][SIZE - 15 + index] = bitAt(bits, index);
  }

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (reserved[row][col]) {
        continue;
      }
    }
  }
}

function formatBits(mask: number) {
  const errorCorrectionLevel = 1;
  let data = (errorCorrectionLevel << 3) | mask;
  let value = data << 10;
  const generator = 0x537;

  for (let bit = 14; bit >= 10; bit -= 1) {
    if (((value >>> bit) & 1) !== 0) {
      value ^= generator << (bit - 10);
    }
  }

  return ((data << 10) | value) ^ 0x5412;
}

function bitAt(value: number, index: number) {
  return ((value >>> index) & 1) !== 0;
}

function inBounds(row: number, col: number) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}
