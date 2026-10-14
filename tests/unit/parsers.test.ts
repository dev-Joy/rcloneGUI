/**
 *  Parsers test
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - combined·JSON 로그 파서 테스트 (실제 rclone 출력 fixture)
 */

/**
 *  External imports
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { countItems, parseCombined, parseCombinedLine } from "@/main/parsers/combined";
import { createLineSplitter, formatErrorLine, parseLogLine } from "@/main/parsers/json-log";

// fixtures는 rclone v1.75.1 (Windows)에서 scripts/probes/rclone-probes.ps1로 받은 실제 출력이다.
const f_Fixture = (name: string): string => readFileSync(join(__dirname, "../fixtures", name), "utf8");

describe("parseCombinedLine", () => {
    it.each([
        ["+ only-src.txt", "add"],
        ["* changed.txt", "change"],
        ["- only-dst.txt", "delete"],
        ["= same.txt", "same"],
        ["! broken.txt", "error"],
    ] as const)("%s → %s", (line, status) => {
        expect(parseCombinedLine(line)).toEqual({ path: line.slice(2), status });
    });

    it("한글·공백·하위 폴더 경로를 그대로 읽는다", () => {
        expect(parseCombinedLine("+ 한글 dir/file with space.txt")).toEqual({
            path: "한글 dir/file with space.txt",
            status: "add",
        });
    });

    it("CRLF 줄 끝을 떼어 낸다", () => {
        expect(parseCombinedLine("= same.txt\r")).toEqual({ path: "same.txt", status: "same" });
    });

    it("경로 앞뒤 공백은 파일명의 일부로 둔다", () => {
        expect(parseCombinedLine("+  lead.txt")).toEqual({ path: " lead.txt", status: "add" });
    });

    it.each(["", "+", "+ ", "? what.txt", "+nospace.txt", "plain text"])(
        "형식이 아닌 줄 %j 은 null",
        (line) => {
            expect(parseCombinedLine(line)).toBeNull();
        },
    );
});

describe("parseCombined", () => {
    it("미리보기 출력을 상태별로 센다", () => {
        const items = parseCombined(f_Fixture("combined-a.txt"));
        expect(countItems(items)).toEqual({ add: 2, change: 1, delete: 1, same: 2, error: 0 });
        expect(items).toContainEqual({ path: "한글 dir/file with space.txt", status: "add" });
    });

    it("삭제 한도에 걸린 실행: 같은 경로의 - 와 ! 는 오류 한 줄로 합친다", () => {
        const text = f_Fixture("combined-g.txt");
        const items = parseCombined(text);
        // 어느 파일이 한도에 걸리는지는 실행마다 다르므로 fixture에서 직접 찾는다.
        const failed = text
            .split("\n")
            .filter((l) => l.startsWith("! "))
            .map((l) => l.slice(2));
        expect(failed).toHaveLength(2);
        for (const path of failed) {
            expect(text).toContain("- " + path + "\n");
            expect(items.filter((i) => i.path === path)).toEqual([{ path, status: "error" }]);
        }
        expect(countItems(items)).toEqual({ add: 2, change: 1, delete: 1, same: 2, error: 2 });
    });

    it("오류가 먼저 나오고 다른 기호가 뒤따라도 오류를 남긴다", () => {
        expect(parseCombined("! a.txt\n- a.txt\n")).toEqual([{ path: "a.txt", status: "error" }]);
    });

    it("CRLF 파일과 빈 줄을 견딘다", () => {
        expect(parseCombined("+ a.txt\r\n\r\n= b.txt\r\n")).toEqual([
            { path: "a.txt", status: "add" },
            { path: "b.txt", status: "same" },
        ]);
    });

    it("빈 출력은 빈 목록이다", () => {
        expect(parseCombined("")).toEqual([]);
    });
});

describe("parseLogLine", () => {
    it("미리보기 로그의 마지막 통계 줄에서 진행률을 읽는다", () => {
        const lines = f_Fixture("log-a.jsonl").split("\n").filter(Boolean).map(parseLogLine);
        expect(lines.every((l) => l !== null)).toBe(true);
        const stats = lines.findLast((l) => l?.progress)?.progress;
        expect(stats).toMatchObject({
            bytes: 25,
            totalBytes: 25,
            transfers: 3,
            totalTransfers: 3,
            checks: 4,
            deletes: 1,
            errors: 0,
            eta: null,
            speed: 0,
        });
    });

    it("삭제 한도 오류 줄을 error 수준과 대상 파일로 읽는다", () => {
        const errors = f_Fixture("log-g.jsonl")
            .split("\n")
            .map(parseLogLine)
            .filter((l) => l?.level === "error");
        expect(errors.length).toBeGreaterThanOrEqual(2);
        expect(formatErrorLine(errors[0]!)).toMatch(
            /^\S+\.txt: Got fatal error on delete: --max-delete threshold reached$/,
        );
    });

    it("통계가 없는 줄은 progress가 없다", () => {
        const line = parseLogLine('{"level":"info","msg":"Copied (new)","size":8,"object":"a.txt"}');
        expect(line).toEqual({ level: "info", msg: "Copied (new)", object: "a.txt", progress: undefined });
    });

    it("통계 값 일부가 빠지거나 형이 달라도 0으로 채운다", () => {
        const line = parseLogLine('{"level":"info","msg":"","stats":{"bytes":"x","totalBytes":10,"eta":12}}');
        expect(line?.progress).toMatchObject({ bytes: 0, totalBytes: 10, eta: 12, transfers: 0 });
    });

    it.each(["", "plain text notice", "{broken", "2026/10/11 NOTICE: text", "[1,2]", "null"])(
        "JSON 객체가 아닌 줄 %j 은 null",
        (line) => {
            expect(parseLogLine(line)).toBeNull();
        },
    );
});

describe("createLineSplitter", () => {
    it("조각 경계에서 끊긴 줄을 이어 붙인다", () => {
        const lines: string[] = [];
        const splitter = createLineSplitter((line) => lines.push(line));
        splitter.push('{"a":1}\n{"b"');
        splitter.push(':2}\n{"c":3}');
        expect(lines).toEqual(['{"a":1}', '{"b":2}']);
        splitter.flush();
        expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
    });
});
