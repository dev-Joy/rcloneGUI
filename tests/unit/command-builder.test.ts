/**
 *  Command builder test
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - 명령 생성 규칙과 차단 목록 테스트
 */

/**
 *  External imports
 */
import { describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import {
    assertSafeArgs,
    buildArgs,
    buildFilterText,
    clsCommandError,
    formatCommand,
    jobHash,
    type itfBuildContext,
} from "@/main/rclone/command-builder";
import { makeJob } from "./helpers";

const base = {
    filterPath: "C:\\runs\\sample-job\\r1\\filter.txt",
    combinedPath: "C:\\runs\\sample-job\\r1\\combined.txt",
    defaultConfig: null,
};

const preview: itfBuildContext = { ...base, kind: "preview" };

const execute: itfBuildContext = {
    ...base,
    kind: "execute",
    maxDelete: 3,
    backupDir: "D:\\.baton-backup\\sample-job\\r1",
};

const f_ValueOf = (args: string[], flag: string): string | undefined => args[args.indexOf(flag) + 1];

describe("buildArgs", () => {
    it("모드·원본·대상을 맨 앞에 인자 하나씩 그대로 넣는다 (공백·한글 경로)", () => {
        const args = buildArgs(makeJob(), preview);
        expect(args.slice(0, 3)).toEqual(["sync", "C:\\work\\원본 폴더", "D:\\backup\\대상 폴더"]);
    });

    it("미리보기에만 --dry-run을 붙인다", () => {
        expect(buildArgs(makeJob(), preview)).toContain("--dry-run");
        expect(buildArgs(makeJob(), execute)).not.toContain("--dry-run");
    });

    it("미리보기와 실행은 --dry-run, --max-delete, --backup-dir만 다르다", () => {
        const f_Strip = (args: string[]): string[] => {
            const out: string[] = [];
            for (let i = 0; i < args.length; i += 1) {
                if (args[i] === "--dry-run") continue;
                if (args[i] === "--max-delete" || args[i] === "--backup-dir") {
                    i += 1;
                    continue;
                }
                out.push(args[i]);
            }
            return out;
        };
        expect(f_Strip(buildArgs(makeJob(), execute))).toEqual(f_Strip(buildArgs(makeJob(), preview)));
    });

    it("미리보기에는 삭제 한도와 백업 폴더를 넣지 않는다", () => {
        const args = buildArgs(makeJob(), preview);
        expect(args).not.toContain("--max-delete");
        expect(args).not.toContain("--backup-dir");
    });

    it("sync 실행에는 확인한 삭제 수와 백업 폴더를 넣는다", () => {
        const args = buildArgs(makeJob(), execute);
        expect(f_ValueOf(args, "--max-delete")).toBe("3");
        expect(f_ValueOf(args, "--backup-dir")).toBe("D:\\.baton-backup\\sample-job\\r1");
    });

    it("삭제가 0개로 확인됐으면 --max-delete 0으로 삭제를 전부 막는다", () => {
        expect(f_ValueOf(buildArgs(makeJob(), { ...execute, maxDelete: 0 }), "--max-delete")).toBe("0");
    });

    it("sync 실행에 삭제 수가 없거나 음수면 거부한다", () => {
        expect(() => buildArgs(makeJob(), { ...execute, maxDelete: undefined })).toThrow(clsCommandError);
        expect(() => buildArgs(makeJob(), { ...execute, maxDelete: -1 })).toThrow(clsCommandError);
        expect(() => buildArgs(makeJob(), { ...execute, maxDelete: 1.5 })).toThrow(clsCommandError);
    });

    it("백업이 켜진 작업은 백업 경로 없이 실행할 수 없다", () => {
        expect(() => buildArgs(makeJob(), { ...execute, backupDir: null })).toThrow(/백업 폴더/);
    });

    it("copy 실행에는 삭제 한도를 넣지 않고 백업 폴더는 넣는다", () => {
        const args = buildArgs(makeJob({ mode: "copy" }), execute);
        expect(args[0]).toBe("copy");
        expect(args).not.toContain("--max-delete");
        expect(args).toContain("--backup-dir");
    });

    it("백업을 끈 작업은 --backup-dir를 넣지 않는다", () => {
        const job = makeJob({ safety: { backup: false, autoMaxDelete: 50, allowIgnoreErrors: false } });
        expect(buildArgs(job, { ...execute, backupDir: null })).not.toContain("--backup-dir");
    });

    it("필터 파일·combined·JSON 로그·재시도 1회를 항상 넣는다", () => {
        for (const ctx of [preview, execute]) {
            const args = buildArgs(makeJob(), ctx);
            expect(f_ValueOf(args, "--filter-from")).toBe(base.filterPath);
            expect(f_ValueOf(args, "--combined")).toBe(base.combinedPath);
            expect(args).toContain("--use-json-log");
            expect(args).toContain("-v");
            expect(f_ValueOf(args, "--stats")).toBe("1s");
            expect(f_ValueOf(args, "--retries")).toBe("1");
        }
    });

    it("checkers·transfers·skip-links를 작업 옵션대로 넣는다", () => {
        const job = makeJob({ options: { checkers: 2, transfers: 8, fastList: false, skipLinks: false } });
        const args = buildArgs(job, preview);
        expect(f_ValueOf(args, "--checkers")).toBe("2");
        expect(f_ValueOf(args, "--transfers")).toBe("8");
        expect(args).not.toContain("--skip-links");
        expect(buildArgs(makeJob(), preview)).toContain("--skip-links");
    });

    it("--fast-list는 리모트가 낀 작업에만 넣는다", () => {
        const options = { checkers: 2, transfers: 2, fastList: true, skipLinks: true };
        expect(buildArgs(makeJob({ options }), preview)).not.toContain("--fast-list");
        expect(buildArgs(makeJob({ options, dest: "remote-x:Backup" }), preview)).toContain("--fast-list");
    });

    it("작업의 rclone.conf가 설정의 기본값보다 우선한다", () => {
        const fromDefault = buildArgs(makeJob(), { ...preview, defaultConfig: "C:\\conf\\default.conf" });
        expect(f_ValueOf(fromDefault, "--config")).toBe("C:\\conf\\default.conf");
        const fromJob = buildArgs(makeJob({ rcloneConfig: "C:\\conf\\job.conf" }), {
            ...preview,
            defaultConfig: "C:\\conf\\default.conf",
        });
        expect(f_ValueOf(fromJob, "--config")).toBe("C:\\conf\\job.conf");
        expect(buildArgs(makeJob(), preview)).not.toContain("--config");
    });

    it("기본 명령에는 --ignore-errors가 없다", () => {
        expect(buildArgs(makeJob(), preview)).not.toContain("--ignore-errors");
        expect(buildArgs(makeJob(), execute)).not.toContain("--ignore-errors");
    });

    it("--ignore-errors는 백업이 켜진 작업에서만 허용한다", () => {
        const withBackup = makeJob({ safety: { backup: true, autoMaxDelete: 50, allowIgnoreErrors: true } });
        expect(buildArgs(withBackup, execute)).toContain("--ignore-errors");
        const noBackup = makeJob({ safety: { backup: false, autoMaxDelete: 50, allowIgnoreErrors: true } });
        expect(() => buildArgs(noBackup, preview)).toThrow(clsCommandError);
    });

    it("어떤 조합에서도 차단 목록의 옵션이 나오지 않는다", () => {
        const jobs = [
            makeJob(),
            makeJob({ mode: "copy" }),
            makeJob({
                dest: "remote-x:Backup",
                options: { checkers: 1, transfers: 1, fastList: true, skipLinks: false },
            }),
            makeJob({ safety: { backup: true, autoMaxDelete: 0, allowIgnoreErrors: true } }),
        ];
        for (const job of jobs) {
            for (const ctx of [preview, execute, { ...execute, maxDelete: 0 }]) {
                const args = buildArgs(job, ctx);
                expect(args).not.toContain("--delete-excluded");
                expect(args).not.toContain("--no-check-dest");
                expect(args.some((a) => a.startsWith("--dump"))).toBe(false);
                expect(f_ValueOf(args, "--max-delete")).not.toBe("-1");
            }
        }
    });
});

describe("assertSafeArgs", () => {
    it.each([
        [["sync", "a", "b", "--delete-excluded"]],
        [["sync", "a", "b", "--no-check-dest"]],
        [["sync", "a", "b", "--dump", "headers"]],
        [["sync", "a", "b", "--dump-bodies"]],
        [["sync", "a", "b", "--dump=auth"]],
        [["sync", "a", "b", "--max-delete", "-1"]],
        [["sync", "a", "b", "--max-delete=-1"]],
    ])("%j 를 거부한다", (args) => {
        expect(() => assertSafeArgs(args)).toThrow(clsCommandError);
    });

    it("안전한 인자는 통과시킨다", () => {
        expect(() => assertSafeArgs(["sync", "a", "b", "--max-delete", "0", "--dry-run"])).not.toThrow();
    });
});

describe("buildFilterText", () => {
    it('제외 패턴마다 "- 패턴" 한 줄을 쓴다', () => {
        expect(buildFilterText(["node_modules/**", ".codegraph/daemon.sock"])).toBe(
            "- node_modules/**\n- .codegraph/daemon.sock\n",
        );
    });

    it("제외가 없으면 빈 파일이다", () => {
        expect(buildFilterText([])).toBe("");
    });
});

describe("formatCommand", () => {
    it("공백이 있는 인자만 따옴표로 감싼다", () => {
        expect(formatCommand(["sync", "C:\\work\\원본 폴더", "remote-x:Backup", "--dry-run"])).toBe(
            'rclone sync "C:\\work\\원본 폴더" remote-x:Backup --dry-run',
        );
    });
});

describe("jobHash", () => {
    it("명령에 영향을 주는 값이 바뀌면 달라진다", () => {
        const original = jobHash(makeJob(), null);
        expect(jobHash(makeJob({ mode: "copy" }), null)).not.toBe(original);
        expect(jobHash(makeJob({ source: "C:\\work\\other" }), null)).not.toBe(original);
        expect(jobHash(makeJob({ excludes: [] }), null)).not.toBe(original);
        expect(jobHash(makeJob(), "C:\\conf\\default.conf")).not.toBe(original);
    });

    it("이름이나 자동 실행 설정만 바뀌면 그대로다", () => {
        const original = jobHash(makeJob(), null);
        expect(jobHash(makeJob({ name: "다른 이름" }), null)).toBe(original);
        expect(
            jobHash(makeJob({ schedule: { enabled: true, everyMinutes: 5, chainNext: null } }), null),
        ).toBe(original);
    });
});
