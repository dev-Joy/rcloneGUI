/**
 *  Schedule text
 *
 *  @author dev-Joy    2026-10-17
 *  @description
 *      - 작업 목록에 쓰는 문구: 자동 실행 주기, 최근 실행(동기화 · 비교), 다음 실행 시각
 *      - DOM · React와 무관한 순수 함수
 */

/**
 *  Internal imports
 */
import type { itfRunMeta, typJob } from "@/shared/types";
import { formatDateTime } from "./format";

/**
 *  Types 정의
 */
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토", "일"];

/**
 *  내부 함수
 */
/** 0 ~ 59 · 0 ~ 23 숫자 하나인지 */
function f_Number(text: string, max: number): number | null {
    if (!/^\d{1,2}$/.test(text)) return null;
    const value = Number(text);
    return value <= max ? value : null;
}

const f_Pad = (n: number): string => String(n).padStart(2, "0");

/**
 *  메인 클래스 / export 함수
 */
/** 자동 실행 주기를 사람이 읽는 말로. 흔하지 않은 cron 식은 식 그대로 */
export function describeSchedule(schedule: Pick<typJob["schedule"], "cron" | "everyMinutes">): string {
    if (!schedule.cron) {
        const m = schedule.everyMinutes;
        if (m % 1440 === 0) return `${m / 1440}일마다`;
        if (m % 60 === 0) return `${m / 60}시간마다`;
        return `${m}분마다`;
    }
    const parts = schedule.cron.trim().split(/\s+/);
    if (parts.length !== 5) return `cron ${schedule.cron}`;
    const [min, hour, day, month, weekday] = parts;
    const step = /^\*\/(\d+)$/.exec(min);
    // */N은 0~59분 안에서 N씩 건너뛴다(cron.ts). 60을 나눠 떨어질 때만 일정한 간격이다(*/45는 :00 · :45)
    if (
        step &&
        hour === "*" &&
        day === "*" &&
        month === "*" &&
        weekday === "*" &&
        60 % Number(step[1]) === 0
    ) {
        return `${Number(step[1])}분마다`;
    }
    const minute = f_Number(min, 59);
    if (minute !== null && hour === "*" && day === "*" && month === "*" && weekday === "*") {
        return `매시 ${minute}분`;
    }
    const h = f_Number(hour, 23);
    if (minute !== null && h !== null && month === "*") {
        const time = `${f_Pad(h)}:${f_Pad(minute)}`;
        if (day === "*" && weekday === "*") return `매일 ${time}`;
        if (day === "*" && weekday === "1-5") return `평일 ${time}`;
        const wd = /^[0-7]$/.test(weekday) ? Number(weekday) : null;
        if (day === "*" && wd !== null) return `매주 ${WEEKDAYS[wd]}요일 ${time}`;
        // 29 ~ 31일은 그 날이 없는 달에는 돌지 않으므로 식 그대로 둔다
        const d = /^\d{1,2}$/.test(day) && Number(day) >= 1 && Number(day) <= 28 ? Number(day) : null;
        if (d !== null && weekday === "*") return `매월 ${d}일 ${time}`;
    }
    return `cron ${schedule.cron}`;
}

/**
 * 목록의 최근 실행 문구. history는 최근 실행부터.
 * 실제 동기화를 먼저 쓰고, 그 뒤에 비교만 했으면 덧붙인다
 */
export function lastRunText(history: readonly Pick<itfRunMeta, "kind" | "status" | "startedAt">[]): string {
    const executeIndex = history.findIndex((run) => run.kind === "execute");
    const latest = history[0];
    if (executeIndex === -1) return latest ? `비교 ${formatDateTime(latest.startedAt)}` : "기록 없음";
    const execute = history[executeIndex];
    const label =
        execute.status === "success"
            ? "동기화"
            : execute.status === "canceled"
              ? "동기화 취소"
              : execute.status === "failed"
                ? "동기화 실패"
                : "동기화 중";
    const text = `${label} ${formatDateTime(execute.startedAt)}`;
    return executeIndex > 0 ? `${text} · 비교 ${formatDateTime(latest.startedAt)}` : text;
}

/** 다음 실행 시각 문구. 오늘이면 시:분, 다른 날이면 월-일 시:분 */
export function nextRunText(at: Date, now: Date): string {
    const time = `${f_Pad(at.getHours())}:${f_Pad(at.getMinutes())}`;
    const sameDay =
        at.getFullYear() === now.getFullYear() &&
        at.getMonth() === now.getMonth() &&
        at.getDate() === now.getDate();
    return sameDay ? `다음 ${time}` : `다음 ${f_Pad(at.getMonth() + 1)}-${f_Pad(at.getDate())} ${time}`;
}
