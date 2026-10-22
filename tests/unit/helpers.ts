/**
 *  Helpers
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 단위 테스트 공용 도우미
 */

/**
 *  Internal imports
 */
import type { typJob } from "@/shared/types";

/** 테스트용 작업. 실제 사용자 경로는 쓰지 않는다 (AGENTS.md 1.4). */
export function makeJob(overrides: Partial<typJob> = {}): typJob {
    return {
        id: "sample-job",
        name: "샘플 작업",
        mode: "sync",
        source: "C:\\work\\원본 폴더",
        dest: "D:\\backup\\대상 폴더",
        excludes: ["node_modules/**", "_session/**"],
        options: {
            checkers: 4,
            transfers: 4,
            fastList: false,
            skipLinks: true,
            readDetails: true,
            scope: "files",
        },
        safety: { backup: true, autoMaxDelete: 50, allowIgnoreErrors: false },
        schedule: { enabled: false, everyMinutes: 30, chainNext: null, cron: null, paused: null },
        rcloneConfig: null,
        groupId: null,
        optionsFile: null,
        skip: [],
        ...overrides,
    };
}
