/**
 *  Job store test
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 스키마, 작업 저장소, 실행 저장소 테스트
 */

/**
 *  External imports
 */
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { clsJobError, clsJobStore, makeJobId, validateJobPaths } from "@/main/store/job-store";
import { formatRunId, clsRunStore } from "@/main/store/run-store";
import { jobInputSchema, jobSchema } from "@/shared/schemas";
import type { typJobInput } from "@/shared/types";
import { makeJob } from "./helpers";

describe("jobSchema", () => {
    it("기본 작업을 통과시킨다", () => {
        expect(jobSchema.safeParse(makeJob()).success).toBe(true);
    });

    it.each([
        ["빈 이름", { name: "  " }],
        ["모르는 모드", { mode: "move" }],
        ["옵션처럼 보이는 원본", { source: "--delete-excluded" }],
        ["줄바꿈이 든 대상", { dest: "D:\\a\nb" }],
        ["줄바꿈이 든 제외 패턴", { excludes: ["a\n+ **"] }],
        ["경로 탈출을 노린 ID", { id: "..\\..\\x" }],
        ["0 이하 checkers", { options: { checkers: 0, transfers: 1, fastList: false, skipLinks: true } }],
    ])("%s 은 거부한다", (_label, patch) => {
        expect(jobSchema.safeParse({ ...makeJob(), ...patch }).success).toBe(false);
    });

    it("새 작업 입력은 빈 ID를 허용한다", () => {
        expect(jobInputSchema.safeParse({ ...makeJob(), id: "" }).success).toBe(true);
        expect(jobSchema.safeParse({ ...makeJob(), id: "" }).success).toBe(false);
    });
});

describe("validateJobPaths", () => {
    const f_Code = (fn: () => void): string => {
        try {
            fn();
        } catch (error) {
            return error instanceof clsJobError ? error.code : "OTHER";
        }
        return "OK";
    };

    it("서로 다른 원본·대상은 통과", () => {
        expect(f_Code(() => validateJobPaths(makeJob()))).toBe("OK");
        expect(
            f_Code(() => validateJobPaths(makeJob({ source: "D:\\backup\\x", dest: "remote-x:Backup" }))),
        ).toBe("OK");
    });

    it("원본과 대상이 같거나 포함 관계면 거부", () => {
        expect(f_Code(() => validateJobPaths(makeJob({ source: "C:\\a", dest: "C:\\a\\b" })))).toBe(
            "PATHS_OVERLAP",
        );
        expect(f_Code(() => validateJobPaths(makeJob({ source: "C:\\a\\b", dest: "c:\\A" })))).toBe(
            "PATHS_OVERLAP",
        );
    });

    it("대상이 드라이브 최상위면 백업 폴더가 대상 안에 들어가므로 거부", () => {
        expect(f_Code(() => validateJobPaths(makeJob({ dest: "D:\\" })))).toBe("BACKUP_OVERLAPS_DEST");
    });

    it("원본이 백업 폴더 안이면 거부", () => {
        expect(
            f_Code(() =>
                validateJobPaths(makeJob({ source: "D:\\.rclonegui-backup\\x", dest: "D:\\backup" })),
            ),
        ).toBe("BACKUP_OVERLAPS_SOURCE");
    });

    it("백업을 끄면 백업 경로 검사는 하지 않는다", () => {
        const safety = { backup: false, autoMaxDelete: 50, allowIgnoreErrors: false };
        expect(f_Code(() => validateJobPaths(makeJob({ dest: "D:\\", safety })))).toBe("OK");
    });

    it("상대 경로 대상은 백업 위치를 정할 수 없어 거부", () => {
        expect(f_Code(() => validateJobPaths(makeJob({ dest: "relative\\dir" })))).toBe(
            "BACKUP_ROOT_UNKNOWN",
        );
    });
});

describe("makeJobId", () => {
    it("이름에서 영문·숫자만 남긴다", () => {
        expect(makeJobId("Sample Server: WSL → E", new Set())).toBe("sample-server-wsl-e");
    });

    it("쓸 글자가 없으면 job, 겹치면 번호를 붙인다", () => {
        expect(makeJobId("한글 이름", new Set())).toBe("job");
        expect(makeJobId("한글 이름", new Set(["job", "job-2"]))).toBe("job-3");
    });
});

describe("작업·실행 저장소 (임시 폴더)", () => {
    let dir: string;
    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "rclonegui-unit-"));
        await mkdir(join(dir, "src"));
    });
    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    const f_Input = (patch: Partial<typJobInput> = {}): typJobInput => ({
        ...makeJob({ name: "Temp Job", source: join(dir, "src"), dest: join(dir, "dst") }),
        id: "",
        ...patch,
    });

    it("저장한 작업은 새 저장소 인스턴스에서도 읽힌다", async () => {
        const saved = await new clsJobStore(dir).save(f_Input());
        expect(saved.id).toBe("temp-job");
        expect(await new clsJobStore(dir).list()).toEqual([saved]);
        expect(JSON.parse(await readFile(join(dir, "jobs.json"), "utf8"))).toHaveLength(1);
    });

    it("같은 ID로 저장하면 덮어쓰고, 새 이름이 겹치면 번호를 붙인다", async () => {
        const store = new clsJobStore(dir);
        const first = await store.save(f_Input());
        await store.save({ ...first, name: "바꾼 이름" });
        const second = await store.save(f_Input());
        const jobs = await store.list();
        expect(jobs.map((j) => j.id)).toEqual(["temp-job", "temp-job-2"]);
        expect(jobs[0].name).toBe("바꾼 이름");
        expect(second.id).toBe("temp-job-2");
    });

    it("없는 원본 폴더는 저장을 거부한다", async () => {
        await expect(new clsJobStore(dir).save(f_Input({ source: join(dir, "nope") }))).rejects.toMatchObject(
            {
                code: "SOURCE_MISSING",
            },
        );
    });

    it("백업 없이 --ignore-errors를 켠 작업은 저장을 거부한다", async () => {
        const safety = { backup: false, autoMaxDelete: 50, allowIgnoreErrors: true };
        await expect(new clsJobStore(dir).save(f_Input({ safety }))).rejects.toMatchObject({
            code: "IGNORE_ERRORS_NEEDS_BACKUP",
        });
    });

    it("작업을 지우면 그 작업을 가리키던 체인도 끊는다", async () => {
        const store = new clsJobStore(dir);
        const b = await store.save(f_Input({ name: "B", dest: join(dir, "dst-b") }));
        const a = await store.save(
            f_Input({ name: "A", schedule: { enabled: false, everyMinutes: 30, chainNext: b.id } }),
        );
        await store.delete(b.id);
        expect((await store.get(a.id)).schedule.chainNext).toBeNull();
        await expect(store.get(b.id)).rejects.toMatchObject({ code: "JOB_NOT_FOUND" });
    });

    it("실행 ID는 시각 형식이고, 같은 초에는 번호를 붙인다", async () => {
        const runs = new clsRunStore(dir);
        const at = new Date(2026, 9, 12, 15, 30, 5);
        expect(formatRunId(at)).toBe("20261012-153005");
        expect(await runs.create("job-a", at)).toBe("20261012-153005");
        expect(await runs.create("job-a", at)).toBe("20261012-153005-2");
        expect(await runs.list("job-a")).toEqual([]);
        expect(await runs.list("no-such-job")).toEqual([]);
        expect(await runs.readItems("job-a", "20261012-153005")).toEqual([]);
    });
});
