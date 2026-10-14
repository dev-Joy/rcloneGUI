/**
 *  ZBC button
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 공용 버튼
 *      - 기본 · 강조 · 위험 · 링크 · 아이콘 모양과 작은 크기를 지원
 */

/**
 *  External imports
 */
import type { ButtonHTMLAttributes } from "react";

/**
 *  Props & Types 정의
 */
type typZBCButtonVariant = "default" | "primary" | "danger" | "link" | "icon";

export interface itfZBCButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: typZBCButtonVariant;
    small?: boolean;
}

const propsDefault = {
    variant: "default",
    small: false,
} satisfies Partial<itfZBCButtonProps>;

const VARIANT_CLASS: Record<typZBCButtonVariant, string> = {
    default: "",
    primary: "zbcButtonPrimary",
    danger: "zbcButtonDanger",
    link: "zbcButtonLink",
    icon: "zbcButtonIcon",
};

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function ZBCButton(iProps: itfZBCButtonProps) {
    const { variant, small, className, children, ...rest } = { ...propsDefault, ...iProps };

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
        /** zbc + zbcButton + 모양·크기 클래스 */
        className: [
            "zbc",
            "zbcButton",
            VARIANT_CLASS[variant],
            small ? "zbcButtonSmall" : "",
            className ?? "",
        ]
            .filter(Boolean)
            .join(" "),
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    return (
        <button type="button" className={_V.className} {...rest}>
            {children}
        </button>
    );
}
