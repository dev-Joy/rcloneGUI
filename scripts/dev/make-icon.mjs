// rcloneGUI 아이콘(resources/icon.png, 256x256)을 만든다. 외부 이미지 없이 그림을 직접 계산한다 (F10 트레이 · F12 설치본).
// 사용: node scripts/dev/make-icon.mjs
// 파란 둥근 사각형 위에 서로 반대로 가는 흰 화살표 두 개 (원본 → 대상, 대상 ← 원본 비교).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const SIZE = 256;
const ACCENT = [47, 111, 237];
const WHITE = [255, 255, 255];

/** 둥근 사각형 안인지 (모서리 반지름 r) */
function inRoundedRect(x, y, r) {
    const cx = Math.min(Math.max(x, r), SIZE - 1 - r);
    const cy = Math.min(Math.max(y, r), SIZE - 1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** 가로 화살표 (몸통 y0~y1, x0~x1, 머리는 dir 방향) */
function inArrow(x, y, { y0, y1, x0, x1, dir }) {
    const mid = (y0 + y1) / 2;
    const head = 34;
    const body = dir > 0 ? x >= x0 && x <= x1 - head : x <= x1 && x >= x0 + head;
    if (body && y >= y0 && y <= y1) return true;
    const tipX = dir > 0 ? x1 : x0;
    const baseX = dir > 0 ? x1 - head : x0 + head;
    const t = (x - baseX) / (tipX - baseX);
    return t >= 0 && t <= 1 && Math.abs(y - mid) <= (1 - t) * 34;
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y += 1) {
    raw[y * (SIZE * 4 + 1)] = 0;
    for (let x = 0; x < SIZE; x += 1) {
        const o = y * (SIZE * 4 + 1) + 1 + x * 4;
        let color = null;
        if (inRoundedRect(x, y, 48)) color = ACCENT;
        if (
            inArrow(x, y, { y0: 84, y1: 104, x0: 56, x1: 200, dir: 1 }) ||
            inArrow(x, y, { y0: 152, y1: 172, x0: 56, x1: 200, dir: -1 })
        ) {
            color = WHITE;
        }
        if (color) {
            raw[o] = color[0];
            raw[o + 1] = color[1];
            raw[o + 2] = color[2];
            raw[o + 3] = 255;
        }
    }
}

/** PNG 조각 하나 */
function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

function crc32(buf) {
    let c = ~0;
    for (const b of buf) {
        c ^= b;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // 8비트
header[9] = 6; // RGBA
const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), "../../resources/icon.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`${out} (${png.length} bytes)`);
