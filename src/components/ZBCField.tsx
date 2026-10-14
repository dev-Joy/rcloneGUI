/**
 *  ZBC field
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 공용 입력 항목 틀
 *      - 이름표, 입력(과 옆 버튼), 도움말을 세로로 놓는다
 */

/**
 *  External imports
 */
import type { ReactNode } from "react";

/**
 *  Props & Types 정의
 */
export interface itfZBCFieldProps {
    label: string;
    children: ReactNode;
    /** 입력 오른쪽에 붙는 버튼 등 */
    action?: ReactNode;
    hint?: ReactNode;
    className?: string;
}

const propsDefault = {} satisfies Partial<itfZBCFieldProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function ZBCField(iProps: itfZBCFieldProps) {
    const { label, children, action, hint, className } = { ...propsDefault, ...iProps };

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
        className: ["zbc", "zbcField", className ?? ""].filter(Boolean).join(" "),
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    return (
        <div className={_V.className}>
            <span className="zbcFieldLabel">{label}</span>
            {action ? (
                <div className="zbcFieldRow">
                    {children}
                    {action}
                </div>
            ) : (
                children
            )}
            {hint && <div className="zbcFieldHint">{hint}</div>}
        </div>
    );
}
