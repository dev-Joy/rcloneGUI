/**
 *  Snapshot
 *
 *  @author dev-Joy    2026-10-17
 *  @description
 *      - 실행할 때의 필터 내용과 rclone.conf 지문(경로 · 크기 · 수정 시각)을 실행 기록에 남긴다
 *      - rclone.conf는 열지 않는다(stat만). 내용 · 해시는 남기지 않는다 (AGENTS.md 1.6)
 */

/**
 *  External imports
 */
import { stat } from "node:fs/promises";

/**
 *  Internal imports
 */
import type { itfConfigSnapshot, typConfigCheck, typConfigSource } from "@/shared/types";

/**
 *  Types 정의
 */
/**
 * 필터 스냅샷 최대 글자 수(64K자). 실행 기록 100건을 한 번에 화면에 넘기므로 크게 두지 않는다.
 * 넘으면 앞부분만 남긴다. 전체는 실행 폴더의 filter.txt에 그대로 있다
 */
export const FILTER_SNAPSHOT_LIMIT = 64 * 1024;

/**
 *  메인 클래스 / export 함수
 */
/** 필터 파일 내용을 기록용으로. 너무 길면 앞부분만 */
export function filterSnapshot(text: string): { filter: string; filterTruncated: boolean } {
    return text.length > FILTER_SNAPSHOT_LIMIT
        ? { filter: text.slice(0, FILTER_SNAPSHOT_LIMIT), filterTruncated: true }
        : { filter: text, filterTruncated: false };
}

/** `rclone config file` 출력의 마지막 줄(설정 파일 경로). 없으면 null */
export function parseConfigFilePath(text: string): string | null {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const last = lines.at(-1);
    return last && !last.endsWith(":") ? last : null;
}

/** rclone.conf의 경로 · 크기 · 수정 시각. 파일을 열지 않는다 */
export async function statConfig(path: string, source: typConfigSource): Promise<itfConfigSnapshot> {
    try {
        const info = await stat(path);
        return { path, source, exists: true, size: info.size, modifiedAt: info.mtime.toISOString() };
    } catch {
        // 없거나 읽을 권한이 없음. 어느 쪽이든 그때 쓸 수 있는 파일은 아니었다
        return { path, source, exists: false, size: null, modifiedAt: null };
    }
}

/**
 * rclone 기본 rclone.conf 경로를 rclone 실행 파일마다 한 번만 묻는다.
 * rclone은 실행 파일 옆의 rclone.conf를 먼저 쓰므로(포터블 설정) exe가 다르면 따로 묻는다.
 * 실패하거나 경로가 없으면 남기지 않고 다음에 다시 묻는다
 */
export class clsDefaultConfigCache {
    private readonly byExe = new Map<string, Promise<string | null>>();

    constructor(private readonly lookup: (exe: string) => Promise<string | null>) {}

    get(exe: string): Promise<string | null> {
        const cached = this.byExe.get(exe);
        if (cached) return cached;
        const pending = this.lookup(exe).then(
            (path) => {
                if (path === null) this.byExe.delete(exe);
                return path;
            },
            () => {
                this.byExe.delete(exe);
                return null;
            },
        );
        this.byExe.set(exe, pending);
        return pending;
    }
}

/** 기록할 때와 지금의 지문 비교 */
export function compareConfig(then: itfConfigSnapshot, now: itfConfigSnapshot): typConfigCheck {
    if (!now.exists) return then.exists ? "missing" : "same";
    if (!then.exists) return "changed";
    return then.size === now.size && then.modifiedAt === now.modifiedAt ? "same" : "changed";
}
