/**
 *  Cron
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - 작업 자동 실행 시각 계산 (F10). 5개 필드 cron 식(분 시 일 월 요일)과 N분 간격
 *      - 외부 라이브러리 없이 쓰는 순수 함수. 시각은 실행 환경의 로컬 시간
 */

/**
 *  Types 정의
 */
export interface itfCron {
    minutes: ReadonlySet<number>;
    hours: ReadonlySet<number>;
    days: ReadonlySet<number>;
    months: ReadonlySet<number>;
    weekdays: ReadonlySet<number>;
    /** 일 필드가 * 인지. 일과 요일이 둘 다 지정되면 둘 중 하나만 맞아도 된다 (표준 cron) */
    anyDay: boolean;
    anyWeekday: boolean;
}

const FIELDS = [
    { name: "분", min: 0, max: 59 },
    { name: "시", min: 0, max: 23 },
    { name: "일", min: 1, max: 31 },
    { name: "월", min: 1, max: 12 },
    { name: "요일", min: 0, max: 7 },
] as const;

/** 다음 시각을 찾을 때 볼 최대 기간 (분). 4년이면 2월 29일 같은 드문 식도 찾는다 */
const SEARCH_LIMIT_MINUTES = 4 * 366 * 24 * 60;

/**
 *  내부 함수
 */
function f_ParseField(text: string, field: (typeof FIELDS)[number]): Set<number> {
    const values = new Set<number>();
    for (const part of text.split(",")) {
        const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
        if (!match) throw new Error(`${field.name} 필드 형식이 아닙니다: ${part}`);
        const [, range, stepText] = match;
        const step = stepText === undefined ? 1 : Number(stepText);
        if (step < 1) throw new Error(`${field.name} 필드의 간격은 1 이상이어야 합니다`);
        let from: number = field.min;
        let to: number = field.max;
        if (range !== "*") {
            const [a, b] = range.split("-").map(Number);
            from = a;
            to = b ?? (stepText === undefined ? a : field.max);
        }
        if (from < field.min || to > field.max || from > to) {
            throw new Error(`${field.name} 필드는 ${field.min} ~ ${field.max}입니다: ${part}`);
        }
        for (let v = from; v <= to; v += step) values.add(v);
    }
    return values;
}

/**
 *  메인 클래스 / export 함수
 */
/** "분 시 일 월 요일" 5개 필드를 읽는다. 형식이 틀리면 한국어 메시지로 던진다. */
export function parseCron(expression: string): itfCron {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) throw new Error("cron 식은 분 시 일 월 요일 5개 필드입니다 (예: */30 * * * *)");
    const [minutes, hours, days, months, weekdaysRaw] = parts.map((part, i) => f_ParseField(part, FIELDS[i]));
    // 요일 7은 0(일요일)과 같다.
    const weekdays = new Set([...weekdaysRaw].map((d) => (d === 7 ? 0 : d)));
    return { minutes, hours, days, months, weekdays, anyDay: parts[2] === "*", anyWeekday: parts[4] === "*" };
}

/** cron 식이 맞는지. 틀리면 그 이유, 맞으면 null */
export function cronProblem(expression: string): string | null {
    try {
        const cron = parseCron(expression);
        return nextCronTime(cron, new Date(2026, 0, 1)) === null ? "이 cron 식은 실행될 날이 없습니다" : null;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

/** after보다 뒤의 첫 실행 시각(초 0). 4년 안에 없으면 null */
export function nextCronTime(cron: itfCron, after: Date): Date | null {
    const t = new Date(after.getTime());
    t.setSeconds(0, 0);
    t.setMinutes(t.getMinutes() + 1);
    for (let i = 0; i < SEARCH_LIMIT_MINUTES; i += 1) {
        const dayOk = cron.days.has(t.getDate());
        const weekdayOk = cron.weekdays.has(t.getDay());
        const dateOk =
            cron.anyDay && cron.anyWeekday
                ? true
                : cron.anyDay
                  ? weekdayOk
                  : cron.anyWeekday
                    ? dayOk
                    : dayOk || weekdayOk;
        if (!cron.months.has(t.getMonth() + 1) || !dateOk) {
            // 이 날은 안 된다. 다음 날 0시로 건너뛴다.
            t.setHours(24, 0, 0, 0);
            continue;
        }
        if (!cron.hours.has(t.getHours())) {
            t.setHours(t.getHours() + 1, 0, 0, 0);
            continue;
        }
        if (cron.minutes.has(t.getMinutes())) return t;
        t.setMinutes(t.getMinutes() + 1);
    }
    return null;
}

/** 작업 스케줄의 다음 실행 시각. cron이 있으면 cron, 없으면 after + everyMinutes */
export function nextScheduleTime(
    schedule: { cron: string | null; everyMinutes: number },
    after: Date,
): Date | null {
    if (schedule.cron) return nextCronTime(parseCron(schedule.cron), after);
    return new Date(after.getTime() + schedule.everyMinutes * 60_000);
}
