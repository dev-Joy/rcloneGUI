/**
 *  Job defaults
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 새 작업과 복제 작업의 초깃값
 */

/**
 *  Internal imports
 */
import type { typJob, typJobInput, typSettings } from "@/shared/types";

/**
 *  메인 클래스 / export 함수
 */
/** 새 작업. 지우지 않는 copy와 백업 켬이 기본이다. 원본 · 대상은 설정의 기본 폴더(F29)로 채운다. */
export function newJob(settings?: Pick<typSettings, "defaultSource" | "defaultDest">): typJobInput {
    return {
        id: "",
        name: "",
        mode: "copy",
        source: settings?.defaultSource ?? "",
        dest: settings?.defaultDest ?? "",
        excludes: ["node_modules/**"],
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
    };
}

/** 기존 작업을 복제한다. ID는 저장할 때 새로 만들고, 자동 실행과 체인은 끈다. */
export function cloneJob(job: typJob): typJobInput {
    return {
        ...job,
        id: "",
        name: `${job.name} (복제)`,
        schedule: { ...job.schedule, enabled: false, chainNext: null, paused: null },
    };
}
