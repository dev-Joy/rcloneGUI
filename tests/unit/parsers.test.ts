/**
 *  Parsers test
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - combined·JSON 로그 파서 테스트 (실제 rclone 출력 fixture)
 *      - log-d-drive-stats.jsonl만 probe가 아니라 앱으로 Google Drive에 올린 실제 실행 로그의 stats 줄이다(파일 이름 · 경로만 바꿈)
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
import {
    countItems,
    formatDirOps,
    parseCombined,
    parseCombinedLine,
    parseDirOps,
} from "@/main/parsers/combined";
import { createLineSplitter, dirOpOf, formatErrorLine, parseLogLine } from "@/main/parsers/json-log";
import { parseAbout } from "@/main/parsers/about";
import { parseLsjson } from "@/main/parsers/lsjson";
import { describeExit } from "@/main/rclone/runner";
import { averageRate } from "@/lib/format";
import { isDestNewer, isDestTooSmall, type itfFileItem } from "@/shared/types";

// fixtures는 rclone v1.75.1 (Windows)에서 scripts/probes/rclone-probes.ps1로 받은 실제 출력이다. log-d-drive-stats.jsonl만 앱 실행 로그에서 왔다.
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
            finishing: 0,
        });
        expect(stats?.elapsed).toBeGreaterThan(0);
    });

    it("Drive 업로드: 지난 시간과 마무리 중인 파일 수를 읽고, 평균으로 남은 시간을 다시 계산한다 (log-d)", () => {
        const stats = f_Fixture("log-d-drive-stats.jsonl")
            .split("\n")
            .filter(Boolean)
            .map((l) => parseLogLine(l)?.progress);
        // 179초 시점: rclone의 순간 속도는 5 KB/s, eta는 68252초(19시간)였다
        const stalled = stats[1]!;
        expect(stalled).toMatchObject({ bytes: 168044512, totalBytes: 517054771, finishing: 3, eta: 68252 });
        expect(stalled.speed).toBeLessThan(10_000);
        const rate = averageRate(stalled);
        expect(rate.speed).toBeGreaterThan(900_000);
        expect(rate.eta).toBeGreaterThan(300);
        expect(rate.eta).toBeLessThan(450);
        expect(stats[0]!.finishing).toBe(2);
        expect(stats[2]!.finishing).toBe(4);
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

describe("parseLsjson (F11)", () => {
    it("실제 lsjson 출력을 경로 → 크기 · 수정 시각으로 읽는다", () => {
        const source = parseLsjson(f_Fixture("lsjson-l-src.json"));
        expect(source.size).toBe(5);
        expect(source.get("changed.txt")).toEqual({ size: 16, modTime: "2026-10-14T15:52:03.7604525+09:00" });
        expect(source.get("한글 dir/file with space.txt")?.size).toBe(1);
        expect(source.get("sub/deep.txt")?.size).toBe(4);
        const dest = parseLsjson(f_Fixture("lsjson-l-dst.json"));
        expect(dest.get("changed.txt")?.size).toBe(9);
        expect(dest.has("only-src.txt")).toBe(false);
    });

    it("폴더 항목은 빼고, 빈 배열은 빈 목록", () => {
        const text = JSON.stringify([
            { Path: "sub", Name: "sub", Size: -1, ModTime: "2026-10-01T10:00:00+09:00", IsDir: true },
            { Path: "sub/a.txt", Name: "a.txt", Size: 3, ModTime: "2026-10-01T10:00:00+09:00", IsDir: false },
        ]);
        expect([...parseLsjson(text).keys()]).toEqual(["sub/a.txt"]);
        expect(parseLsjson("[]").size).toBe(0);
    });

    it("형식이 아니면 던진다", () => {
        expect(() => parseLsjson("")).toThrow();
        expect(() => parseLsjson('[{"Path":"a"}]')).toThrow();
    });
});

describe("isDestNewer (F11)", () => {
    const f_Item = (patch: Partial<itfFileItem>): itfFileItem => ({
        path: "a.txt",
        status: "change",
        source: { size: 1, modTime: "2026-10-14T10:00:00+09:00" },
        dest: { size: 2, modTime: "2026-10-14T11:00:00+09:00" },
        ...patch,
    });

    it("덮어쓸 파일의 대상이 더 나중이면 참", () => {
        expect(isDestNewer(f_Item({}))).toBe(true);
    });

    it("시간대가 달라도 실제 시각으로 비교한다", () => {
        // 10:30 UTC = 19:30 +09:00 → 대상(11:00 +09:00)보다 나중
        expect(isDestNewer(f_Item({ source: { size: 1, modTime: "2026-10-14T10:30:00Z" } }))).toBe(false);
    });

    it("변경이 아니거나 상세가 없으면 거짓", () => {
        expect(isDestNewer(f_Item({ status: "add" }))).toBe(false);
        expect(isDestNewer(f_Item({ status: "same" }))).toBe(false);
        expect(isDestNewer(f_Item({ dest: null }))).toBe(false);
        expect(isDestNewer({ path: "a.txt", status: "change" })).toBe(false);
    });
});

describe("폴더 작업 (F25)", () => {
    const f_Ops = (name: string) =>
        f_Fixture(name)
            .split("\n")
            .map(parseLogLine)
            .map((line) => (line ? dirOpOf(line) : null))
            .filter((op) => op !== null);

    it("미리보기 로그(dry-run)에서 만들 폴더와 지울 빈 폴더를 읽는다", () => {
        expect(f_Ops("log-p3d.jsonl")).toEqual([
            { op: "make", path: "emptydir" },
            { op: "make", path: "한글 dir" },
            { op: "make", path: "emptydir/inner" },
            { op: "remove", path: "dst-emptydir" },
        ]);
    });

    it("실행 로그에서 만든 폴더와 지운 빈 폴더를 읽는다", () => {
        expect(f_Ops("log-p5.jsonl")).toEqual([
            { op: "make", path: "emptydir" },
            { op: "make", path: "한글 dir" },
            { op: "make", path: "emptydir/inner" },
            { op: "remove", path: "dst-emptydir" },
        ]);
    });

    it("폴더 수정 시각 맞추기 · 파일 작업 줄은 폴더 작업이 아니다", () => {
        expect(f_Ops("log-a.jsonl")).toEqual([]);
    });

    it("dirs.txt로 쓰고 다시 읽으면 폴더 항목이 된다", () => {
        const text = formatDirOps([
            { op: "make", path: "한글 dir" },
            { op: "remove", path: "old/empty" },
            { op: "keep", path: "cache" },
        ]);
        expect(text).toBe("+ 한글 dir\n- old/empty\n= cache\n");
        expect(parseDirOps(text)).toEqual([
            { path: "한글 dir", status: "add", isDir: true },
            { path: "old/empty", status: "delete", isDir: true },
            { path: "cache", status: "same", isDir: true },
        ]);
    });

    it("파일 건수에는 폴더 항목을 넣지 않는다 (삭제 수 · --max-delete는 파일 기준)", () => {
        expect(
            countItems([
                { path: "a.txt", status: "delete" },
                { path: "old/empty", status: "delete", isDir: true },
                { path: "new", status: "add", isDir: true },
            ]),
        ).toEqual({ add: 0, change: 0, delete: 1, same: 0, error: 0 });
    });
});

describe("parseAbout (F20)", () => {
    it("실제 about --json 출력을 읽는다", () => {
        const space = parseAbout(f_Fixture("about-q.json"));
        expect(space.total).toBeGreaterThan(0);
        expect(space.free).toBeGreaterThan(0);
        expect((space.used ?? 0) + (space.free ?? 0)).toBeLessThanOrEqual(space.total ?? 0);
    });

    it("빠진 값은 null, 형식이 아니면 던진다", () => {
        expect(parseAbout('{"free": 10}')).toEqual({ total: null, used: null, free: 10 });
        expect(() => parseAbout("")).toThrow();
        expect(() => parseAbout('{"free": -1}')).toThrow();
    });
});

describe("isDestTooSmall (F20)", () => {
    const f_Space = (free: number | null, transferBytes: number) => ({
        source: null,
        dest: { total: 100, used: 0, free },
        transferBytes,
    });

    it("대상 여유가 옮길 크기보다 작으면 참", () => {
        expect(isDestTooSmall(f_Space(10, 11))).toBe(true);
        expect(isDestTooSmall(f_Space(10, 10))).toBe(false);
    });

    it("알 수 없으면 거짓", () => {
        expect(isDestTooSmall(null)).toBe(false);
        expect(isDestTooSmall(f_Space(null, 5))).toBe(false);
        expect(isDestTooSmall({ source: null, dest: null, transferBytes: 5 })).toBe(false);
    });
});

describe("describeExit: 설정에 없는 리모트", () => {
    it("경로 칸에 웹 주소를 넣어 https를 리모트로 읽은 경우 무엇이 틀렸는지 알려 준다", () => {
        const line =
            'Failed to create file system for "https://drive.example.com/drive/folders/abc": didn\'t find section in config file ("https")';
        expect(describeExit(1, [line])).toBe(
            'rclone 설정에 "https" 리모트가 없습니다. rclone config로 만든 리모트 이름을 쓰세요',
        );
        expect(describeExit(0, [])).toBe("성공");
    });
});
