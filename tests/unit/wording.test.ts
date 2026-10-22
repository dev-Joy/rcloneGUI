/**
 *  Wording test
 *
 *  @author dev-Joy    2026-10-22
 *  @description
 *      - 화면 문구 점검 (intent/006): 바꾸기로 한 옛 문구가 화면 소스에 다시 들어오지 않게 한다
 */

/**
 *  External imports
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** 화면에 보이던 옛 문구 (용어표 intent/006) */
const RETIRED = [
    "기타: 상태 칩대로",
    "포함됨 (비교에 든",
    "제외됨 (필터에 걸린",
    "새로 생김 (지난",
    "미리보기 명령 복사",
    "실행 명령 복사",
    "이 미리보기로 실행",
    "지난 미리보기",
    "동기화 (먼저 비교)",
    "그대로 둠",
    "남김 (파일이 있음)",
    "지우기 시도 (비어",
    "이번 실행에서 빼기",
    "이번 실행에서 뺀",
    "다 보낸 파일",
    "비교 시점",
    "옮길 크기",
    "(체인)",
    "이어서: {",
    '"미리보기"',
    "실행 기록",
    "연결(리모트)",
    "[이어서]",
    "이번 실행에서",
    "자동 멈춤:",
    "칩을 눌러",
    "업로드 확인 중",
    "동기화 기록",
    "처리되지 않은 파일",
];

/** 화면 코드 파일 (src/pages, src/lib) */
function f_ScreenFiles(): string[] {
    const files: string[] = [];
    for (const dir of ["src/pages", "src/lib"]) {
        for (const name of readdirSync(dir)) {
            if (/\.(ts|tsx)$/.test(name)) files.push(join(dir, name));
        }
    }
    return files;
}

/** 주석은 화면에 보이지 않으므로 뺀다 (블록 주석, 줄 맨 앞의 // 주석) */
function f_WithoutComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("화면 문구 (intent/006 용어 점검)", () => {
    it.each(RETIRED)("옛 문구 %s 가 화면 코드에 없다", (phrase) => {
        const found = f_ScreenFiles().filter((file) =>
            f_WithoutComments(readFileSync(file, "utf8")).includes(phrase),
        );
        expect(found).toEqual([]);
    });
});
