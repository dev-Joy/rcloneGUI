/**
 *  Cron test
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - cron 식 읽기와 다음 실행 시각 (F10). 시각은 로컬 시간으로 만들고 비교한다
 */

/**
 *  External imports
 */
import { describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { cronProblem, nextCronTime, nextScheduleTime, parseCron } from "@/shared/cron";

/**
 *  내부 함수
 */
/** 로컬 시각 2026-10-16(금) hh:mm */
const f_At = (hh: number, mm: number, day = 16) => new Date(2026, 9, day, hh, mm, 0, 0);

const f_Next = (expression: string, after: Date) => nextCronTime(parseCron(expression), after);

describe("parseCron", () => {
    it("목록 · 범위 · 간격을 읽는다", () => {
        const cron = parseCron("0,30 9-11 * * 1-5");
        expect([...cron.minutes]).toEqual([0, 30]);
        expect([...cron.hours]).toEqual([9, 10, 11]);
        expect([...cron.weekdays]).toEqual([1, 2, 3, 4, 5]);
        expect([...parseCron("*/20 * * * *").minutes]).toEqual([0, 20, 40]);
        expect([...parseCron("5-20/5 * * * *").minutes]).toEqual([5, 10, 15, 20]);
    });

    it("요일 7은 일요일(0)이다", () => {
        expect([...parseCron("0 0 * * 7").weekdays]).toEqual([0]);
    });

    it.each([
        ["필드 수", "* * * *"],
        ["범위 밖 분", "60 * * * *"],
        ["범위 밖 월", "0 0 1 13 *"],
        ["거꾸로 범위", "0 10-5 * * *"],
        ["간격 0", "*/0 * * * *"],
        ["글자", "a * * * *"],
    ])("%s 은(는) 한국어 메시지로 거부한다", (_label, expression) => {
        expect(cronProblem(expression)).toMatch(/필드|cron/);
    });

    it("실행될 날이 없는 식은 거부한다", () => {
        expect(cronProblem("0 0 31 2 *")).toBe("이 cron 식은 실행될 날이 없습니다");
        expect(cronProblem("*/30 * * * *")).toBeNull();
    });
});

describe("nextCronTime", () => {
    it("다음 분부터 찾는다 (같은 분은 다시 돌지 않는다)", () => {
        expect(f_Next("*/30 * * * *", f_At(10, 0))).toEqual(f_At(10, 30));
        expect(f_Next("*/30 * * * *", f_At(10, 29))).toEqual(f_At(10, 30));
        expect(f_Next("* * * * *", new Date(2026, 9, 16, 10, 0, 45))).toEqual(f_At(10, 1));
    });

    it("시간과 날을 넘어간다", () => {
        expect(f_Next("0 9 * * *", f_At(10, 0))).toEqual(f_At(9, 0, 17));
        expect(f_Next("15 2 * * *", f_At(23, 59))).toEqual(f_At(2, 15, 17));
    });

    it("요일 지정: 2026-10-16은 금요일이라 다음 월요일(19일)", () => {
        expect(f_Next("0 8 * * 1", f_At(9, 0))).toEqual(f_At(8, 0, 19));
    });

    it("일과 요일을 둘 다 주면 둘 중 하나만 맞아도 된다", () => {
        // 20일 또는 일요일(18일) 0시 → 18일이 먼저
        expect(f_Next("0 0 20 * 0", f_At(9, 0))).toEqual(new Date(2026, 9, 18, 0, 0));
    });
});

describe("nextScheduleTime", () => {
    it("cron이 없으면 간격(분)을 더한다", () => {
        expect(nextScheduleTime({ cron: null, everyMinutes: 30 }, f_At(10, 7))).toEqual(f_At(10, 37));
    });

    it("cron이 있으면 cron을 따른다", () => {
        expect(nextScheduleTime({ cron: "0 * * * *", everyMinutes: 30 }, f_At(10, 7))).toEqual(f_At(11, 0));
    });
});
