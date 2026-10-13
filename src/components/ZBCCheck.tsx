/**
 *  ZBC check
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - 공용 체크박스 · 라디오
 *      - 글자를 눌러도 선택된다
 */

/**
 *  External imports
 */
import type { ChangeEvent, ReactNode } from "react";

/**
 *  Props & Types 정의
 */
export interface itfZBCCheckProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    children: ReactNode;
    type?: "checkbox" | "radio";
    disabled?: boolean;
    className?: string;
}

const propsDefault = {
    type: "checkbox",
    disabled: false,
} satisfies Partial<itfZBCCheckProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function ZBCCheck(iProps: itfZBCCheckProps) {
    const { checked, onChange, children, type, disabled, className } = { ...propsDefault, ...iProps };

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
        className: ["zbc", "zbcCheck", disabled ? "zbcCheckDisabled" : "", className ?? ""]
            .filter(Boolean)
            .join(" "),
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 선택 여부를 올려 보낸다 */
    function h_Change(event: ChangeEvent<HTMLInputElement>) {
        onChange(event.target.checked);
    }

    return (
        <label className={_V.className}>
            <input
                className="zbcCheckInput"
                type={type}
                checked={checked}
                disabled={disabled}
                onChange={h_Change}
            />
            <span className="zbcCheckLabel">{children}</span>
        </label>
    );
}
