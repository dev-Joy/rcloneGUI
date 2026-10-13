/**
 *  ZBC dot
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - 공용 상태 점
 *      - 실행 결과를 색으로 보여준다
 */

/**
 *  Props & Types 정의
 */
type typZBCDotTone = "none" | "success" | "failed" | "canceled" | "running" | "queued";

export interface itfZBCDotProps {
    tone?: typZBCDotTone;
    className?: string;
}

const propsDefault: itfZBCDotProps = {
    tone: "none",
};

const TONE_CLASS: Record<typZBCDotTone, string> = {
    none: "",
    success: "zbcDotSuccess",
    failed: "zbcDotFailed",
    canceled: "zbcDotCanceled",
    running: "zbcDotRunning",
    queued: "zbcDotQueued",
};

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function ZBCDot(iProps: itfZBCDotProps = propsDefault) {
    const { tone, className } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    //
    // Effect (부수 효과)
    //

    //
    // 내부 변수
    //
    const _V = {
        className: ["zbc", "zbcDot", TONE_CLASS[tone ?? "none"], className ?? ""].filter(Boolean).join(" "),
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    return <span className={_V.className} aria-hidden />;
}
