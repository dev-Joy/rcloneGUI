/**
 *  ZBC modal
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 공용 대화상자
 *      - Esc와 닫기 버튼으로 닫는다
 */

/**
 *  External imports
 */
import { useEffect, type ReactNode } from "react";

/**
 *  Internal imports
 */
import ZBCButton from "./ZBCButton";

/**
 *  Props & Types 정의
 */
export interface itfZBCModalProps {
    title: string;
    onClose: () => void;
    children: ReactNode;
    footer: ReactNode;
    wide?: boolean;
}

const propsDefault = {
    wide: false,
} satisfies Partial<itfZBCModalProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function ZBCModal(iProps: itfZBCModalProps) {
    const { title, onClose, children, footer, wide } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    //
    // Effect (부수 효과)
    //
    useEffect(() => {
        /** Esc로 닫는다 */
        function h_KeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", h_KeyDown);
        return () => window.removeEventListener("keydown", h_KeyDown);
    }, [onClose]);

    //
    // 내부 변수
    //
    const _V = {
        className: wide ? "zbc zbcModal zbcModalWide" : "zbc zbcModal",
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    return (
        <div className="zbcModalWrapper" role="presentation">
            <div className={_V.className} role="dialog" aria-modal="true" aria-label={title}>
                <header className="zbcModalHeader">
                    <h2 className="zbcModalTitle">{title}</h2>
                    <ZBCButton variant="icon" onClick={onClose} aria-label="닫기">
                        ✕
                    </ZBCButton>
                </header>
                <div className="zbcModalBody">{children}</div>
                <footer className="zbcModalFooter">{footer}</footer>
            </div>
        </div>
    );
}
