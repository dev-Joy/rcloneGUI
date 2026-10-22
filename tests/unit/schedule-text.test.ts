/**
 *  Schedule text test
 *
 *  @author dev-Joy    2026-10-17
 *  @description
 *      - 작업 목록 문구: 자동 실행 주기, 최근 실행(동기화 · 비교), 다음 실행 시각
 */

/**
 *  External imports
 */
import { describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { formatDateTime } from "@/lib/format";
import { describeSchedule, lastRunText, nextRunText } from "@/lib/schedule-text";
import type { itfRunMeta } from "@/shared/types";

describe("describeSchedule", () => {
    it.each([
        [{ cron: null, everyMinutes: 1 }, "1분마다"],
        [{ cron: null, everyMinutes: 30 }, "30분마다"],
        [{ cron: null, everyMinutes: 120 }, "2시간마다"],
        [{ cron: null, everyMinutes: 1440 }, "1일마다"],
        [{ cron: null, everyMinutes: 10_080 }, "7일마다"],
        [{ cron: "*/15 * * * *", everyMinutes: 30 }, "15분마다"],
        [{ cron: "5 * * * *", everyMinutes: 30 }, "매시 5분"],
        [{ cron: "0 3 * * *", everyMinutes: 30 }, "매일 03:00"],
        [{ cron: "30 22 * * 1-5", everyMinutes: 30 }, "평일 22:30"],
        [{ cron: "0 9 * * 1", everyMinutes: 30 }, "매주 월요일 09:00"],
        [{ cron: "0 9 * * 7", everyMinutes: 30 }, "매주 일요일 09:00"],
        [{ cron: "0 4 1 * *", everyMinutes: 30 }, "매월 1일 04:00"],
        [{ cron: "0 */2 * * *", everyMinutes: 30 }, "cron 0 */2 * * *"],
        // 60을 나눠 떨어지지 않는 간격은 실제로 일정하지 않다(*/45는 :00 · :45, */90은 매시 정각)
        [{ cron: "*/45 * * * *", everyMinutes: 30 }, "cron */45 * * * *"],
        [{ cron: "*/90 * * * *", everyMinutes: 30 }, "cron */90 * * * *"],
        [{ cron: "*/7 * * * *", everyMinutes: 30 }, "cron */7 * * * *"],
        [{ cron: "*/20 * * * *", everyMinutes: 30 }, "20분마다"],
        [{ cron: "0 4 28 * *", everyMinutes: 30 }, "매월 28일 04:00"],
        [{ cron: "0 4 31 * *", everyMinutes: 30 }, "cron 0 4 31 * *"],
        [{ cron: "0 3 * 6 *", everyMinutes: 30 }, "cron 0 3 * 6 *"],
        [{ cron: "0 3 1 * 1", everyMinutes: 30 }, "cron 0 3 1 * 1"],
    ])("%o → %s", (schedule, text) => {
        expect(describeSchedule(schedule)).toBe(text);
    });
});

describe("lastRunText", () => {
    const f_Run = (kind: itfRunMeta["kind"], status: itfRunMeta["status"], startedAt: string) => ({
        kind,
        status,
        startedAt,
    });
    const t1 = "2026-10-17T01:52:00.000Z";
    const t2 = "2026-10-17T02:10:00.000Z";

    it("실제 동기화를 먼저, 그 뒤 비교만 했으면 덧붙인다", () => {
        expect(lastRunText([f_Run("execute", "success", t1), f_Run("preview", "success", t1)])).toBe(
            `동기화 ${formatDateTime(t1)}`,
        );
        expect(lastRunText([f_Run("preview", "success", t2), f_Run("execute", "success", t1)])).toBe(
            `동기화 ${formatDateTime(t1)} · 비교 ${formatDateTime(t2)}`,
        );
    });

    it("실패 · 취소한 동기화, 비교만, 기록 없음", () => {
        expect(lastRunText([f_Run("execute", "failed", t1)])).toBe(`동기화 실패 ${formatDateTime(t1)}`);
        expect(lastRunText([f_Run("execute", "canceled", t1)])).toBe(`동기화 취소 ${formatDateTime(t1)}`);
        expect(lastRunText([f_Run("preview", "failed", t2), f_Run("preview", "success", t1)])).toBe(
            `비교 ${formatDateTime(t2)}`,
        );
        expect(lastRunText([])).toBe("기록 없음");
    });
});

describe("nextRunText", () => {
    it("오늘이면 시:분, 다른 날이면 월-일 시:분", () => {
        const now = new Date(2026, 9, 17, 1, 0);
        expect(nextRunText(new Date(2026, 9, 17, 2, 30), now)).toBe("다음 02:30");
        expect(nextRunText(new Date(2026, 9, 18, 3, 0), now)).toBe("다음 10-18 03:00");
        expect(nextRunText(new Date(2027, 9, 17, 3, 0), now)).toBe("다음 10-17 03:00");
    });
});
