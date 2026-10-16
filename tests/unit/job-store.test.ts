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
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { openAppDatabase, type clsAppDatabase } from "@/main/store/app-database";
import { newJob } from "@/lib/job-defaults";
import { clsJobError, clsJobStore, makeJobId, validateJobPaths } from "@/main/store/job-store";
import { formatRunId, clsRunStore } from "@/main/store/run-store";
import { findExcludeProblem, INPUT_LIMITS } from "@/shared/limits";
import { jobInputSchema, jobSchema, skipSaveSchema } from "@/shared/schemas";
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
        [
            "0 이하 checkers",
            {
                options: {
                    checkers: 0,
                    transfers: 1,
                    fastList: false,
                    skipLinks: true,
                    readDetails: true,
                    scope: "files",
                },
            },
        ],
    ])("%s 은 거부한다", (_label, patch) => {
        expect(jobSchema.safeParse({ ...makeJob(), ...patch }).success).toBe(false);
    });

    it("새 작업 입력은 빈 ID를 허용한다", () => {
        expect(jobInputSchema.safeParse({ ...makeJob(), id: "" }).success).toBe(true);
        expect(jobSchema.safeParse({ ...makeJob(), id: "" }).success).toBe(false);
    });
});

describe("이번 실행에서 뺀 항목 스키마 (F23)", () => {
    it("예전 작업은 빈 목록으로 읽고, 앞 / · 줄바꿈 · 201개는 거부한다", () => {
        const legacy = { ...makeJob() } as Record<string, unknown>;
        delete legacy["skip"];
        expect(jobSchema.parse(legacy).skip).toEqual([]);
        expect(skipSaveSchema.safeParse({ jobId: "job-a", skip: ["a.txt", "dir/"] }).success).toBe(true);
        expect(skipSaveSchema.safeParse({ jobId: "job-a", skip: ["/a.txt"] }).success).toBe(false);
        expect(skipSaveSchema.safeParse({ jobId: "job-a", skip: ["a\nb"] }).success).toBe(false);
        expect(skipSaveSchema.safeParse({ jobId: "job-a", skip: [""] }).success).toBe(false);
        const many = Array.from({ length: 201 }, (_, i) => `f${i}.txt`);
        expect(skipSaveSchema.safeParse({ jobId: "job-a", skip: many }).success).toBe(false);
    });
});

describe("입력 글자 수 제한 (F28)", () => {
    const f_Message = (patch: Partial<typJobInput>): string | null => {
        const result = jobSchema.safeParse({ ...makeJob(), ...patch });
        return result.success ? null : result.error.issues.map((i) => i.message).join(" · ");
    };

    it("상한까지는 통과하고 하나 넘으면 칸 이름이 든 한국어 메시지로 거부한다", () => {
        expect(f_Message({ name: "가".repeat(INPUT_LIMITS.jobName) })).toBeNull();
        expect(f_Message({ name: "가".repeat(INPUT_LIMITS.jobName + 1) })).toBe(
            "이름은 100자까지 쓸 수 있습니다",
        );
        // "D:\" 3자 + 나머지
        expect(f_Message({ dest: "D:\\" + "a".repeat(INPUT_LIMITS.path - 3) })).toBeNull();
        expect(f_Message({ dest: "D:\\" + "a".repeat(INPUT_LIMITS.path - 2) })).toBe(
            "경로는 1024자까지 쓸 수 있습니다",
        );
        expect(f_Message({ excludes: ["a".repeat(INPUT_LIMITS.excludePattern)] })).toBeNull();
        expect(f_Message({ excludes: ["a".repeat(INPUT_LIMITS.excludePattern + 1)] })).toBe(
            "제외 패턴 한 줄은 512자까지 쓸 수 있습니다",
        );
        expect(f_Message({ excludes: Array(INPUT_LIMITS.excludeCount).fill("a") })).toBeNull();
        expect(f_Message({ excludes: Array(INPUT_LIMITS.excludeCount + 1).fill("a") })).toBe(
            "제외 패턴은 200줄까지 쓸 수 있습니다",
        );
    });

    it("화면의 제외 패턴 검사는 스키마와 같은 상한으로 첫 문제를 알려준다", () => {
        expect(findExcludeProblem(Array(INPUT_LIMITS.excludeCount).fill("a"))).toBeNull();
        expect(findExcludeProblem(Array(INPUT_LIMITS.excludeCount + 1).fill("a"))).toBe(
            "제외 패턴은 200줄까지 쓸 수 있습니다",
        );
        expect(
            findExcludeProblem(["a", "b", "c".repeat(INPUT_LIMITS.excludePattern + 1), "d".repeat(600)]),
        ).toBe("3번째 줄이 512자를 넘습니다");
    });
});

describe("newJob (F29 기본 폴더)", () => {
    it("설정의 기본 원본 · 대상으로 채우고, 없으면 빈 칸", () => {
        expect(newJob({ defaultSource: "C:\\work", defaultDest: "remote:backup" })).toMatchObject({
            source: "C:\\work",
            dest: "remote:backup",
        });
        expect(newJob({ defaultSource: null, defaultDest: null })).toMatchObject({ source: "", dest: "" });
        expect(newJob()).toMatchObject({ source: "", dest: "" });
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
    let db: clsAppDatabase;
    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "rclonegui-unit-"));
        await mkdir(join(dir, "src"));
        db = await openAppDatabase(dir);
    });
    afterEach(async () => {
        db.close();
        await rm(dir, { recursive: true, force: true });
    });

    const f_Input = (patch: Partial<typJobInput> = {}): typJobInput => ({
        ...makeJob({ name: "Temp Job", source: join(dir, "src"), dest: join(dir, "dst") }),
        id: "",
        ...patch,
    });

    it("저장한 작업은 새 저장소 인스턴스에서도 읽힌다", async () => {
        const saved = await new clsJobStore(db).save(f_Input());
        expect(saved.id).toBe("temp-job");
        db.close();
        db = await openAppDatabase(dir);
        expect(await new clsJobStore(db).list()).toEqual([saved]);
    });

    it("같은 ID로 저장하면 덮어쓰고, 새 이름이 겹치면 번호를 붙인다", async () => {
        const store = new clsJobStore(db);
        const first = await store.save(f_Input());
        await store.save({ ...first, name: "바꾼 이름" });
        const second = await store.save(f_Input());
        const jobs = await store.list();
        expect(jobs.map((j) => j.id)).toEqual(["temp-job", "temp-job-2"]);
        expect(jobs[0].name).toBe("바꾼 이름");
        expect(second.id).toBe("temp-job-2");
    });

    it("없는 원본 폴더는 저장을 거부한다", async () => {
        await expect(new clsJobStore(db).save(f_Input({ source: join(dir, "nope") }))).rejects.toMatchObject({
            code: "SOURCE_MISSING",
        });
    });

    it("백업 없이 --ignore-errors를 켠 작업은 저장을 거부한다", async () => {
        const safety = { backup: false, autoMaxDelete: 50, allowIgnoreErrors: true };
        await expect(new clsJobStore(db).save(f_Input({ safety }))).rejects.toMatchObject({
            code: "IGNORE_ERRORS_NEEDS_BACKUP",
        });
    });

    it("작업을 지우면 그 작업을 가리키던 체인도 끊는다", async () => {
        const store = new clsJobStore(db);
        const b = await store.save(f_Input({ name: "B", dest: join(dir, "dst-b") }));
        const a = await store.save(
            f_Input({
                name: "A",
                schedule: { enabled: false, everyMinutes: 30, chainNext: b.id, cron: null, paused: null },
            }),
        );
        await store.delete(b.id);
        expect((await store.get(a.id)).schedule.chainNext).toBeNull();
        await expect(store.get(b.id)).rejects.toMatchObject({ code: "JOB_NOT_FOUND" });
    });

    it("저장은 자동 실행 멈춤(paused)을 화면 값으로 덮지 않는다 (F10 · SR-10)", async () => {
        const store = new clsJobStore(db);
        const saved = await store.save(f_Input());
        await store.setPaused(saved.id, {
            at: "2026-10-16T01:00:00.000Z",
            reason: "삭제 3개가 자동 한도 1개를 넘습니다",
        });
        // 편집 창은 열 때 받은 paused: null을 그대로 보낸다
        const resaved = await store.save({ ...saved, name: "이름만 바꿈" });
        expect(resaved.schedule.paused?.reason).toBe("삭제 3개가 자동 한도 1개를 넘습니다");
        expect((await new clsJobStore(db).get(saved.id)).schedule.paused).not.toBeNull();
        // 새 작업은 멈춤 없이 시작한다
        const fresh = await store.save({
            ...f_Input({ name: "새 작업", dest: join(dir, "dst-new") }),
            schedule: { ...saved.schedule, paused: { at: "x", reason: "화면이 보낸 값" } },
        });
        expect(fresh.schedule.paused).toBeNull();
        await store.setPaused(saved.id, null);
        expect((await store.get(saved.id)).schedule.paused).toBeNull();
    });

    it("뺀 항목(F23)은 setSkip으로만 바뀌고, 비우기는 예상한 목록 그대로일 때만 한다", async () => {
        const store = new clsJobStore(db);
        const saved = await store.save(f_Input());
        expect(saved.skip).toEqual([]);
        await store.setSkip(saved.id, ["a.txt", "dir/", "a.txt"]);
        expect((await store.get(saved.id)).skip).toEqual(["a.txt", "dir/"]);
        // 편집 창은 열 때 받은 skip을 보내지만 저장은 저장된 값을 지킨다
        const resaved = await store.save({ ...saved, name: "이름만 바꿈", skip: [] });
        expect(resaved.skip).toEqual(["a.txt", "dir/"]);
        // 새 작업(복제 등)은 빈 목록으로 시작한다
        const fresh = await store.save({
            ...f_Input({ name: "복제", dest: join(dir, "dst-copy") }),
            skip: ["x"],
        });
        expect(fresh.skip).toEqual([]);

        expect(await store.clearSkipIf(saved.id, ["a.txt"])).toBe(false);
        expect((await store.get(saved.id)).skip).toEqual(["a.txt", "dir/"]);
        expect(await store.clearSkipIf(saved.id, ["a.txt", "dir/"])).toBe(true);
        expect((await new clsJobStore(db).get(saved.id)).skip).toEqual([]);
        expect(await store.clearSkipIf(saved.id, [])).toBe(false);
    });

    it("실행 ID는 시각 형식이고, 같은 초에는 번호를 붙인다", async () => {
        const runs = new clsRunStore(db, dir);
        const at = new Date(2026, 9, 12, 15, 30, 5);
        expect(formatRunId(at)).toBe("20261012-153005");
        expect(await runs.create("job-a", at)).toBe("20261012-153005");
        expect(await runs.create("job-a", at)).toBe("20261012-153005-2");
        expect(await runs.list("job-a")).toEqual([]);
        expect(await runs.list("no-such-job")).toEqual([]);
        expect(await runs.readItems("job-a", "20261012-153005")).toEqual([]);
    });
});
