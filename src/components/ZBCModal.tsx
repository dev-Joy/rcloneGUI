/**
 *  ZBC modal
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 공용 대화상자
 *      - Esc와 닫기 버튼으로 닫는다. 대화상자 위에 대화상자를 열면 Esc · Tab은 맨 위 것만 다룬다
 *      - Tab은 대화상자 안에서만 돈다. 닫히면 연 곳(단추)으로 초점을 돌려준다
 */

/**
 *  External imports
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

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

/** 열려 있는 대화상자 (연 순서). Esc는 마지막 것만 닫는다 */
const OPEN_MODALS: object[] = [];

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

    /** 이 대화상자를 가리키는 표 (OPEN_MODALS에서 자기 자리를 찾는다) */
    const tokenRef = useRef<object>({});
    /** 연 곳(단추). 처음 그릴 때 잡는다 — effect에서 잡으면 안쪽 autoFocus 칸이 먼저 초점을 가져간다 */
    const [opener] = useState(() =>
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
    );
    /** 대화상자 상자 (Tab을 안에서 돌린다) */
    const dialogRef = useRef<HTMLDivElement>(null);
    /** 최신 onClose (Esc 처리기를 다시 달지 않고 쓴다) */
    const onCloseRef = useRef(onClose);

    //
    // Effect (부수 효과)
    //
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const token = tokenRef.current;
        OPEN_MODALS.push(token);
        // 안쪽에 autoFocus 칸이 없으면 대화상자 상자로 초점을 옮긴다 (초점이 뒤 화면에 남지 않게)
        const box = dialogRef.current;
        if (box && !(document.activeElement instanceof Node && box.contains(document.activeElement))) {
            box.focus();
        }
        /** Esc로 닫고, Tab은 안에서 돌린다. 위에 다른 대화상자가 열려 있으면 그쪽만 다룬다 */
        function h_KeyDown(event: KeyboardEvent) {
            if (OPEN_MODALS[OPEN_MODALS.length - 1] !== token) return;
            if (event.key === "Escape") {
                onCloseRef.current();
                return;
            }
            if (event.key === "Tab") f_KeepFocusInside(event);
        }
        /** 첫 칸에서 Shift+Tab이면 끝으로, 끝에서 Tab이면 처음으로. 바깥에 있으면 안으로 데려온다 */
        function f_KeepFocusInside(event: KeyboardEvent) {
            const box = dialogRef.current;
            if (!box) return;
            const items = Array.from(
                box.querySelectorAll<HTMLElement>(
                    "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
                ),
            ).filter((el) => el.offsetParent !== null);
            if (items.length === 0) return;
            const first = items[0]!;
            const last = items[items.length - 1]!;
            const active = document.activeElement;
            if (!(active instanceof Node) || !box.contains(active)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        }
        window.addEventListener("keydown", h_KeyDown);
        return () => {
            window.removeEventListener("keydown", h_KeyDown);
            const index = OPEN_MODALS.indexOf(token);
            if (index !== -1) OPEN_MODALS.splice(index, 1);
            // 닫힐 때 연 곳으로 초점을 돌려준다 (키보드 사용자가 자리를 잃지 않게)
            if (opener?.isConnected) opener.focus();
        };
    }, [opener]);

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
            <div
                className={_V.className}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                ref={dialogRef}
                tabIndex={-1}
            >
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
