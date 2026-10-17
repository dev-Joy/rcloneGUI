/**
 *  Snapshot test
 *
 *  @author dev-Joy    2026-10-17
 *  @description
 *      - 실행 스냅샷: 필터 내용 자르기, rclone config file 출력 읽기, rclone.conf 지문(stat) · 비교
 */

/**
 *  External imports
 */
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import {
    clsDefaultConfigCache,
    compareConfig,
    FILTER_SNAPSHOT_LIMIT,
    filterSnapshot,
    parseConfigFilePath,
    statConfig,
} from "@/main/rclone/snapshot";
import { runMetaSchema } from "@/shared/schemas";

describe("filterSnapshot", () => {
    it("필터 내용을 그대로, 너무 길면 앞부분만 남기고 잘렸다고 적는다", () => {
        expect(filterSnapshot("- /a.txt\n- node_modules/**\n")).toEqual({
            filter: "- /a.txt\n- node_modules/**\n",
            filterTruncated: false,
        });
        const long = "x".repeat(FILTER_SNAPSHOT_LIMIT + 10);
        const cut = filterSnapshot(long);
        expect(cut.filterTruncated).toBe(true);
        expect(cut.filter.length).toBe(FILTER_SNAPSHOT_LIMIT);
    });
});

describe("parseConfigFilePath (rclone config file)", () => {
    it("있을 때와 없을 때 모두 마지막 줄이 경로다 (v1.75.1 출력, 경로만 바꿈)", () => {
        expect(parseConfigFilePath("Configuration file is stored at:\r\nC:\\work\\rclone.conf\r\n")).toBe(
            "C:\\work\\rclone.conf",
        );
        expect(
            parseConfigFilePath(
                "Configuration file doesn't exist, but rclone will use this path:\nC:\\work\\x.conf\n",
            ),
        ).toBe("C:\\work\\x.conf");
        expect(parseConfigFilePath("")).toBeNull();
        expect(parseConfigFilePath("Configuration file is stored at:\n")).toBeNull();
    });
});

describe("statConfig · compareConfig", () => {
    let dir: string;
    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "rclonegui-snapshot-"));
    });
    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("파일을 열지 않고 크기 · 수정 시각을 남기고, 바뀌면 changed · 지우면 missing", async () => {
        const path = join(dir, "work.conf");
        await writeFile(path, "", "utf8");
        const then = await statConfig(path, "job");
        expect(then).toMatchObject({ path, source: "job", exists: true, size: 0 });
        expect(compareConfig(then, await statConfig(path, "job"))).toBe("same");

        await writeFile(path, "[remote-a]\ntype = local\n", "utf8");
        expect(compareConfig(then, await statConfig(path, "job"))).toBe("changed");

        // 크기가 같아도 수정 시각이 다르면 바뀐 것
        const sameSize = await statConfig(path, "job");
        await utimes(path, new Date(2026, 0, 1), new Date(2026, 0, 1));
        expect(compareConfig(sameSize, await statConfig(path, "job"))).toBe("changed");

        await rm(path);
        const gone = await statConfig(path, "job");
        expect(gone).toEqual({ path, source: "job", exists: false, size: null, modifiedAt: null });
        expect(compareConfig(then, gone)).toBe("missing");
        expect(compareConfig(gone, gone)).toBe("same");
        await writeFile(path, "", "utf8");
        expect(compareConfig(gone, await statConfig(path, "job"))).toBe("changed");
    });
});

describe("clsDefaultConfigCache (rclone 기본 rclone.conf 경로)", () => {
    it("rclone 실행 파일마다 한 번만 묻고, exe가 바뀌면 다시 묻는다", async () => {
        const asked: string[] = [];
        const cache = new clsDefaultConfigCache(async (exe) => {
            asked.push(exe);
            return `${exe}.conf`;
        });
        expect(await cache.get("a.exe")).toBe("a.exe.conf");
        expect(await cache.get("a.exe")).toBe("a.exe.conf");
        expect(await cache.get("b.exe")).toBe("b.exe.conf");
        expect(asked).toEqual(["a.exe", "b.exe"]);
    });

    it("실패하거나 경로가 없으면 남기지 않고 다음에 다시 묻는다", async () => {
        let calls = 0;
        const cache = new clsDefaultConfigCache(async () => {
            calls += 1;
            if (calls === 1) throw new Error("timeout");
            if (calls === 2) return null;
            return "ok.conf";
        });
        expect(await cache.get("a.exe")).toBeNull();
        expect(await cache.get("a.exe")).toBeNull();
        expect(await cache.get("a.exe")).toBe("ok.conf");
        expect(await cache.get("a.exe")).toBe("ok.conf");
        expect(calls).toBe(3);
    });
});

describe("예전 실행 기록 읽기", () => {
    it("snapshot 키가 없는 예전 메타는 snapshot: null로 읽는다", () => {
        const legacy = {
            runId: "20261010-100000",
            jobId: "job-a",
            kind: "preview",
            status: "success",
            exitCode: 0,
            counts: { add: 0, change: 0, delete: 0, same: 0, error: 0 },
            startedAt: "2026-10-10T01:00:00.000Z",
            endedAt: "2026-10-10T01:00:01.000Z",
            jobHash: "h",
            command: "rclone",
            mode: "sync",
            backupDir: null,
            previewRunId: null,
            blocked: null,
            message: "성공",
            errors: [],
        };
        expect(runMetaSchema.parse(legacy).snapshot).toBeNull();
    });
});
