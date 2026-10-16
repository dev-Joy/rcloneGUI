/**
 *  Wsl test
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - WSL 배포판 목록 파서 테스트 (F24)
 */

/**
 *  External imports
 */
import { describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { parseWslList, wslRoot } from "@/main/system/wsl";
import { pickFolderInputSchema, wslDistroSchema } from "@/shared/schemas";

describe("parseWslList", () => {
    it("이 PC의 실제 출력 바이트(UTF-16LE, CRLF)를 읽는다", () => {
        // wsl.exe -l -q, Windows 11, 2026-10-16: "Ubuntu\r\n"
        const bytes = Buffer.from([0x55, 0, 0x62, 0, 0x75, 0, 0x6e, 0, 0x74, 0, 0x75, 0, 0x0d, 0, 0x0a, 0]);
        expect(parseWslList(bytes)).toEqual(["Ubuntu"]);
    });

    it("여러 배포판, 빈 줄, 앞뒤 공백과 NUL을 정리한다", () => {
        const text = "Ubuntu-22.04\r\n\r\n  Debian \r\n\0\r\n";
        expect(parseWslList(Buffer.from(text, "utf16le"))).toEqual(["Ubuntu-22.04", "Debian"]);
    });

    it("빈 출력은 빈 목록", () => {
        expect(parseWslList(Buffer.alloc(0))).toEqual([]);
    });
});

describe("wslRoot", () => {
    it("\\\\wsl.localhost\\<배포판>\\ 형식", () => {
        expect(wslRoot("Ubuntu")).toBe("\\\\wsl.localhost\\Ubuntu\\");
    });
});

describe("WSL 입력 검증 (F24)", () => {
    it.each(["Ubuntu", "Ubuntu-22.04", "my_distro.v2"])("배포판 이름 %s 는 받는다", (name) => {
        expect(wslDistroSchema.safeParse(name).success).toBe(true);
    });

    it.each(["", "..\\..\\Windows", "a/b", "C:", "Ubuntu\\home", "x".repeat(65)])(
        "경로처럼 보이거나 너무 긴 이름 %s 는 거부한다",
        (name) => {
            expect(wslDistroSchema.safeParse(name).success).toBe(false);
        },
    );

    it("폴더 선택 입력은 칸 이름만, 또는 칸 이름과 배포판 이름만 받는다", () => {
        expect(pickFolderInputSchema.safeParse("source").success).toBe(true);
        expect(pickFolderInputSchema.safeParse({ target: "dest", wslDistro: "Ubuntu" }).success).toBe(true);
        expect(pickFolderInputSchema.safeParse({ target: "dest", wslDistro: "../x" }).success).toBe(false);
        expect(pickFolderInputSchema.safeParse({ target: "bogus", wslDistro: "Ubuntu" }).success).toBe(false);
        expect(pickFolderInputSchema.safeParse("C:\\Windows").success).toBe(false);
    });
});
