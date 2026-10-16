/**
 *  Item menu
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - 비교 목록 줄의 오른쪽 클릭 메뉴 (F23). 이번 실행에서 빼기 · 경로 복사
 *      - 바깥을 누르거나 Esc · 스크롤 · 창 크기 변경이면 닫힌다
 */

/**
 *  External imports
 */
import { useEffect, useRef, type KeyboardEvent as typReactKeyboardEvent } from "react";

/**
 *  Internal imports
 */
import styles from "./ItemMenu.module.css";

/**
 *  Props & Types 정의
 */
export interface itfItemMenuEntry {
    label: string;
    onSelect: () => void;
}

export interface itfItemMenuProps {
    /** 화면 좌표 (px) */
    x: number;
    y: number;
    /** 메뉴 제목 (항목 경로) */
    title: string;
    entries: itfItemMenuEntry[];
    onClose: () => void;
    /** 메뉴 너비 (화면 밖으로 나가지 않게 자리를 잡을 때 쓴다) */
    width?: number;
}

const propsDefault = {
    width: 240,
} satisfies Partial<itfItemMenuProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function ItemMenu(iProps: itfItemMenuProps) {
    const { x, y, title, entries, onClose, width } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    /** 메뉴 상자 */
    const menuRef = useRef<HTMLDivElement>(null);

    //
    // Effect (부수 효과)
    //

    // 열릴 때 한 번만 첫 항목에 초점을 둔다 (부모가 다시 그려도 화살표로 옮긴 초점을 지킨다).
    useEffect(() => {
        menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }, []);

    // 바깥 클릭 · Esc · 스크롤 · 창 크기 변경이면 닫는다.
    useEffect(() => {
        const f_Outside = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) onClose();
        };
        const f_Key = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", f_Outside);
        document.addEventListener("keydown", f_Key);
        window.addEventListener("resize", onClose);
        document.addEventListener("scroll", onClose, true);
        return () => {
            document.removeEventListener("mousedown", f_Outside);
            document.removeEventListener("keydown", f_Key);
            window.removeEventListener("resize", onClose);
            document.removeEventListener("scroll", onClose, true);
        };
    }, [onClose]);

    //
    // 내부 변수
    //
    const _V = {
        /** 화면 오른쪽 · 아래로 넘치지 않게 */
        left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(y, window.innerHeight - (entries.length * 32 + 40) - 8)),
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 항목을 고르고 닫는다 */
    function h_Select(entry: itfItemMenuEntry) {
        onClose();
        entry.onSelect();
    }

    /** 위 · 아래 화살표로 항목 사이를 옮긴다 */
    function h_KeyDown(event: typReactKeyboardEvent<HTMLDivElement>) {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        buttons[(next + buttons.length) % buttons.length]?.focus();
    }

    return (
        <div
            ref={menuRef}
            className={styles.ItemMenu}
            role="menu"
            aria-label={title}
            style={{ left: _V.left, top: _V.top, width }}
            onKeyDown={h_KeyDown}
        >
            <div className={styles.title} title={title}>
                {title}
            </div>
            {entries.map((entry) => (
                <button
                    type="button"
                    key={entry.label}
                    role="menuitem"
                    className={styles.entry}
                    onClick={() => h_Select(entry)}
                >
                    {entry.label}
                </button>
            ))}
        </div>
    );
}
