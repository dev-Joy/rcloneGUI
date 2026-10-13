/**
 *  ZBC badge
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - 공용 배지
 *      - 파일 상태 색(추가 · 변경 · 삭제 · 오류 · 같음)을 그대로 쓴다
 */

/**
 *  External imports
 */
import type { ReactNode } from "react";

/**
 *  Props & Types 정의
 */
type typZBCBadgeTone = "add" | "change" | "delete" | "error" | "same";

export interface itfZBCBadgeProps {
    children: ReactNode;
    tone?: typZBCBadgeTone;
    className?: string;
}

const propsDefault = {
    tone: "same",
} satisfies Partial<itfZBCBadgeProps>;

const TONE_CLASS: Record<typZBCBadgeTone, string> = {
    add: "zbcBadgeAdd",
    change: "zbcBadgeChange",
    delete: "zbcBadgeDelete",
    error: "zbcBadgeError",
    same: "zbcBadgeSame",
};

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function ZBCBadge(iProps: itfZBCBadgeProps) {
    const { children, tone, className } = { ...propsDefault, ...iProps };

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
        className: ["zbc", "zbcBadge", TONE_CLASS[tone], className ?? ""].filter(Boolean).join(" "),
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    return <span className={_V.className}>{children}</span>;
}
