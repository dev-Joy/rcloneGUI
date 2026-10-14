/**
 *  ZBC input
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 공용 한 줄 입력
 *      - 값이 바뀌면 문자열을 그대로 넘긴다
 */

/**
 *  External imports
 */
import type { ChangeEvent, InputHTMLAttributes } from "react";

/**
 *  Props & Types 정의
 */
export interface itfZBCInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
    value: string | number;
    onChange: (value: string) => void;
}

const propsDefault = {
    type: "text",
} satisfies Partial<itfZBCInputProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function ZBCInput(iProps: itfZBCInputProps) {
    const { value, onChange, className, ...rest } = { ...propsDefault, ...iProps };

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
        className: ["zbc", "zbcInput", className ?? ""].filter(Boolean).join(" "),
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 입력값을 문자열로 올려 보낸다 */
    function h_Change(event: ChangeEvent<HTMLInputElement>) {
        onChange(event.target.value);
    }

    return <input className={_V.className} value={value} onChange={h_Change} {...rest} />;
}
