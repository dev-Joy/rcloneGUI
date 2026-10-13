/**
 *  Job store
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - 작업 저장소 (jobs.json)와 저장 전 검증
 */

/**
 *  External imports
 */
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

/**
 *  Internal imports
 */
import { jobSchema } from "@/shared/schemas";
import type { typJob, typJobInput } from "@/shared/types";
import { backupRoot, isRemote, pathsOverlap } from "@/main/rclone/paths";
import { readJson, writeJson } from "./json-file";

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
    private readonly file: string;
    private jobs: typJob[] | null = null;

    constructor(baseDir: string) {
        this.file = join(baseDir, "jobs.json");
    }

    async list(): Promise<typJob[]> {
        if (this.jobs === null) {
            const raw = await readJson(this.file);
            this.jobs = raw === null ? [] : z.array(jobSchema).parse(raw);
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
        const job: typJob = { ...input, id };

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
        if (!isRemote(job.source)) await f_AssertDirectory(job.source);

        const index = jobs.findIndex((j) => j.id === id);
        const next = index === -1 ? [...jobs, job] : jobs.map((j) => (j.id === id ? job : j));
        await writeJson(this.file, next);
        this.jobs = next;
        return job;
    }

    async delete(jobId: string): Promise<void> {
        const jobs = await this.list();
        const next = jobs
            .filter((j) => j.id !== jobId)
            .map((j) =>
                j.schedule.chainNext === jobId ? { ...j, schedule: { ...j.schedule, chainNext: null } } : j,
            );
        await writeJson(this.file, next);
        this.jobs = next;
    }
}
