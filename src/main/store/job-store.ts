/**
 *  Job store
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 작업 저장소 (rclonegui.db의 jobs 표)와 저장 전 검증
 */

/**
 *  External imports
 */
import { stat } from "node:fs/promises";
import { z } from "zod";

/**
 *  Internal imports
 */
import { jobSchema } from "@/shared/schemas";
import type { typJob, typJobInput } from "@/shared/types";
import { backupRoot, isRemote, pathsOverlap } from "@/main/rclone/paths";
import type { clsAppDatabase } from "./app-database";

/**
 *  내부 함수
 */
async function f_AssertDirectory(path: string): Promise<void> {
    try {
        const info = await stat(path);
        if (info.isDirectory()) return;
    } catch {
        // 아래에서 같은 안내로 처리한다.
    }
    throw new clsJobError("SOURCE_MISSING", `원본 폴더를 찾을 수 없습니다: ${path}`);
}

/**
 *  메인 클래스 / export 함수
 */
export class clsJobError extends Error {
    constructor(
        readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = "clsJobError";
    }
}

/** 원본·대상·백업 경로가 서로 포함 관계인지 검사한다. 문제가 있으면 던진다. */
export function validateJobPaths(job: Pick<typJob, "source" | "dest" | "safety">): void {
    if (pathsOverlap(job.source, job.dest)) {
        throw new clsJobError("PATHS_OVERLAP", "원본과 대상이 같거나 서로 포함합니다");
    }
    if (!job.safety.backup) return;
    const backup = backupRoot(job.dest);
    if (backup === null) {
        throw new clsJobError(
            "BACKUP_ROOT_UNKNOWN",
            "대상은 드라이브 문자로 시작하는 전체 경로(E:\\…)나 리모트:경로로 적어야 백업 위치를 정할 수 있습니다",
        );
    }
    if (pathsOverlap(backup, job.dest)) {
        throw new clsJobError(
            "BACKUP_OVERLAPS_DEST",
            `백업 폴더(${backup})가 대상 안에 들어갑니다. 대상을 드라이브 최상위가 아닌 하위 폴더로 지정하세요`,
        );
    }
    if (pathsOverlap(backup, job.source)) {
        throw new clsJobError("BACKUP_OVERLAPS_SOURCE", `백업 폴더(${backup})가 원본과 겹칩니다`);
    }
}

/** 체인(F09): 이을 작업이 있어야 하고, 이어 가다 자기에게 돌아오는 고리는 안 된다 (SR-11) */
export function assertChain(job: Pick<typJob, "id" | "schedule">, jobs: readonly typJob[]): void {
    const next = job.schedule.chainNext;
    if (next === null) return;
    const byId = new Map(jobs.map((j) => [j.id, j]));
    if (!byId.has(next)) throw new clsJobError("CHAIN_MISSING", "이어서 실행할 작업을 찾을 수 없습니다");
    const seen = new Set([job.id]);
    let current: string | null = next;
    while (current !== null) {
        if (seen.has(current)) {
            throw new clsJobError(
                "CHAIN_LOOP",
                "이어서 실행하는 작업들이 고리를 이룹니다(같은 작업을 다시 지납니다). 고리는 만들 수 없습니다",
            );
        }
        seen.add(current);
        current = byId.get(current)?.schedule.chainNext ?? null;
    }
}

/** 이름에서 ID를 만든다. 한글 이름처럼 쓸 글자가 없으면 job으로 시작한다. */
export function makeJobId(name: string, taken: ReadonlySet<string>): string {
    const base =
        name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40)
            .replace(/-+$/, "") || "job";
    let id = base;
    for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
    return id;
}

export class clsJobStore {
    private jobs: typJob[] | null = null;

    constructor(private readonly app: clsAppDatabase) {}

    async list(): Promise<typJob[]> {
        if (this.jobs === null) {
            const rows = this.app.db.prepare("SELECT data FROM jobs ORDER BY position, id").all() as {
                data: string;
            }[];
            this.jobs = z.array(jobSchema).parse(rows.map((row) => JSON.parse(row.data) as unknown));
        }
        return this.jobs;
    }

    async get(jobId: string): Promise<typJob> {
        const job = (await this.list()).find((j) => j.id === jobId);
        if (!job) throw new clsJobError("JOB_NOT_FOUND", "작업을 찾을 수 없습니다");
        return job;
    }

    async save(input: typJobInput): Promise<typJob> {
        const jobs = await this.list();
        const id = input.id || makeJobId(input.name, new Set(jobs.map((j) => j.id)));
        // 자동 실행 멈춤(paused)은 setPaused로만 바뀐다. 화면이 열어 둔 사이에 멈췄다면 화면 값으로 덮지 않는다 (F10 · SR-10).
        const stored = jobs.find((j) => j.id === id);
        const job: typJob = {
            ...input,
            id,
            schedule: { ...input.schedule, paused: stored?.schedule.paused ?? null },
            // 이번 실행에서 뺀 항목(F23)은 setSkip으로만 바뀐다. 편집 창이 연 사이 실행 뒤 비워졌다면 되살리지 않는다.
            skip: stored?.skip ?? [],
        };

        validateJobPaths(job);
        if (job.safety.allowIgnoreErrors && !job.safety.backup) {
            throw new clsJobError(
                "IGNORE_ERRORS_NEEDS_BACKUP",
                "--ignore-errors는 백업 폴더가 켜진 작업에서만 쓸 수 있습니다",
            );
        }
        if (job.schedule.chainNext === job.id) {
            throw new clsJobError("CHAIN_SELF", "작업을 자기 자신에게 이을 수 없습니다");
        }
        assertChain(job, jobs);
        if (
            job.groupId !== null &&
            !this.app.db.prepare("SELECT 1 FROM groups WHERE id = ?").get(job.groupId)
        ) {
            throw new clsJobError("GROUP_NOT_FOUND", "그룹을 찾을 수 없습니다");
        }
        if (!isRemote(job.source)) await f_AssertDirectory(job.source);

        const index = jobs.findIndex((j) => j.id === id);
        const next = index === -1 ? [...jobs, job] : jobs.map((j) => (j.id === id ? job : j));
        // 새 작업은 맨 뒤에 붙고, 고친 작업은 자리를 지킨다.
        this.app.db
            .prepare(
                `INSERT INTO jobs (id, position, data)
                 VALUES (?, (SELECT COALESCE(MAX(position), -1) + 1 FROM jobs), ?)
                 ON CONFLICT (id) DO UPDATE SET data = excluded.data`,
            )
            .run(id, JSON.stringify(job));
        this.jobs = next;
        return job;
    }

    /** 자동 실행 멈춤 상태만 바꾼다 (F10 · SR-10). 경로 검증 없이 schedule.paused만 고친다 */
    async setPaused(jobId: string, paused: typJob["schedule"]["paused"]): Promise<typJob> {
        const job = await this.get(jobId);
        const next: typJob = { ...job, schedule: { ...job.schedule, paused } };
        this.app.db.prepare("UPDATE jobs SET data = ? WHERE id = ?").run(JSON.stringify(next), jobId);
        this.jobs = (await this.list()).map((j) => (j.id === jobId ? next : j));
        return next;
    }

    /** 이번 실행에서 뺀 항목만 바꾼다 (F23). 지문이 바뀌어 그 전 미리보기는 실행에 쓸 수 없다 (SR-13) */
    async setSkip(jobId: string, skip: readonly string[]): Promise<typJob> {
        const job = await this.get(jobId);
        const next: typJob = { ...job, skip: [...new Set(skip)] };
        this.app.db.prepare("UPDATE jobs SET data = ? WHERE id = ?").run(JSON.stringify(next), jobId);
        this.jobs = (await this.list()).map((j) => (j.id === jobId ? next : j));
        return next;
    }

    /** 뺀 항목이 expected 그대로일 때만 비운다 (성공한 실제 동기화 뒤). 비웠으면 true */
    async clearSkipIf(jobId: string, expected: readonly string[]): Promise<boolean> {
        const job = await this.get(jobId);
        if (job.skip.length === 0 || JSON.stringify(job.skip) !== JSON.stringify(expected)) return false;
        await this.setSkip(jobId, []);
        return true;
    }

    /**
     * 그룹을 지울 때 그 그룹의 작업을 "그룹 없음"으로 옮길 준비 (F21).
     * apply()는 바깥 트랜잭션 안에서 DB만 고치고, commit()은 트랜잭션이 끝난 뒤 캐시를 맞춘다.
     */
    async prepareClearGroup(groupId: string): Promise<{ apply(): void; commit(): void }> {
        const jobs = await this.list();
        const next = jobs.map((j) => (j.groupId === groupId ? { ...j, groupId: null } : j));
        return {
            apply: () => {
                const update = this.app.db.prepare("UPDATE jobs SET data = ? WHERE id = ?");
                next.forEach((job, i) => {
                    if (job !== jobs[i]) update.run(JSON.stringify(job), job.id);
                });
            },
            commit: () => {
                this.jobs = next;
            },
        };
    }

    async delete(jobId: string): Promise<void> {
        const jobs = await this.list();
        const next = jobs
            .filter((j) => j.id !== jobId)
            .map((j) =>
                j.schedule.chainNext === jobId ? { ...j, schedule: { ...j.schedule, chainNext: null } } : j,
            );
        const { db } = this.app;
        this.app.transaction(() => {
            db.prepare("DELETE FROM jobs WHERE id = ?").run(jobId);
            const update = db.prepare("UPDATE jobs SET data = ? WHERE id = ?");
            for (const job of next) {
                if (jobs.find((j) => j.id === job.id) !== job) update.run(JSON.stringify(job), job.id);
            }
        });
        this.jobs = next;
    }
}
