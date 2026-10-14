/**
 *  ZBC textarea
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 공용 여러 줄 입력
 *      - 패턴 목록처럼 고정폭 글꼴이 필요한 곳에 사용
 */

/**
 *  External imports
 */
import type { ChangeEvent, TextareaHTMLAttributes } from "react";

/**
 *  Props & Types 정의
 */
export interface itfZBCTextareaProps extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "onChange" | "value"
> {
    value: string;
    onChange: (value: string) => void;
}

const propsDefault = {
    rows: 5,
    spellCheck: false,
} satisfies Partial<itfZBCTextareaProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function ZBCTextarea(iProps: itfZBCTextareaProps) {
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
        className: ["zbc", "zbcTextarea", className ?? ""].filter(Boolean).join(" "),
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 입력값을 문자열로 올려 보낸다 */
    function h_Change(event: ChangeEvent<HTMLTextAreaElement>) {
        onChange(event.target.value);
    }

    return <textarea className={_V.className} value={value} onChange={h_Change} {...rest} />;
}
