/**
 *  Pattern picker dialog
 *
 *  @author dev-Joy    2026-10-22
 *  @description
 *      - 저장된 제외 패턴에서 골라 편집 칸에 덧붙이는 대화상자 (intent/002)
 *      - 작업을 저장하면 그 작업의 패턴이 목록에 모인다. 여기서 지워도 작업의 패턴은 바뀌지 않는다
 */

/**
 *  External imports
 */
import { useEffect, useRef, useState } from "react";

/**
 *  Internal imports
 */
import ZBCButton from "@/components/ZBCButton";
import ZBCCheck from "@/components/ZBCCheck";
import ZBCInput from "@/components/ZBCInput";
import ZBCModal from "@/components/ZBCModal";
import { unwrap, useApp } from "@/stores/app-store";
import type { itfSavedPattern } from "@/shared/types";
import styles from "./PatternPickerDialog.module.css";

/**
 *  Props & Types 정의
 */
export interface itfPatternPickerDialogProps {
    /** 편집 칸에 이미 있는 패턴 (체크된 채 잠근다) */
    current: readonly string[];
    /** 고른 패턴 (이미 있는 것은 빠져 있다) */
    onAdd: (patterns: string[]) => void;
    onClose: () => void;
}

const propsDefault = {} satisfies Partial<itfPatternPickerDialogProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function PatternPickerDialog(iProps: itfPatternPickerDialogProps) {
    const { current, onAdd, onClose } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    /** 오류 알림 */
    const notify = useApp((s) => s.notify);

    /** 저장된 패턴. 받기 전에는 null */
    const [patterns, setPatterns] = useState<itfSavedPattern[] | null>(null);
    /** 목록을 받지 못했을 때 그 이유 */
    const [loadError, setLoadError] = useState<string | null>(null);
    /** 고른 패턴 */
    const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
    /** 찾기 */
    const [query, setQuery] = useState("");
    /** 대화상자 내용 (지운 줄의 단추가 사라지면 찾기 칸으로 초점을 옮긴다) */
    const rootRef = useRef<HTMLDivElement>(null);

    //
    // Effect (부수 효과)
    //
    useEffect(() => {
        unwrap(window.rclonegui.patterns.list()).then(setPatterns, (error: unknown) =>
            setLoadError(error instanceof Error ? error.message : String(error)),
        );
    }, []);

    //
    // 내부 변수
    //
    const have = new Set(current);
    const needle = query.trim().toLowerCase();
    const _V = {
        shown: (patterns ?? []).filter((p) => needle === "" || p.pattern.toLowerCase().includes(needle)),
        /** 칸에 없는 것 중 고른 것 (저장된 순서대로) */
        toAdd: (patterns ?? []).map((p) => p.pattern).filter((p) => picked.has(p) && !have.has(p)),
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 한 줄 고르기 · 풀기 */
    function h_Toggle(pattern: string, checked: boolean) {
        setPicked((prev) => {
            const next = new Set(prev);
            if (checked) next.add(pattern);
            else next.delete(pattern);
            return next;
        });
    }

    /** 목록에서만 뺀다 (작업의 패턴은 그대로) */
    async function h_Forget(pattern: string) {
        try {
            await unwrap(window.rclonegui.patterns.delete(pattern));
            setPatterns((prev) => (prev ?? []).filter((p) => p.pattern !== pattern));
            h_Toggle(pattern, false);
            rootRef.current?.querySelector<HTMLInputElement>("input")?.focus();
        } catch (error) {
            notify("error", error instanceof Error ? error.message : String(error));
        }
    }

    /** 고른 패턴을 칸에 덧붙이고 닫는다 */
    function h_Add() {
        onAdd(_V.toAdd);
        onClose();
    }

    return (
        <ZBCModal
            title="저장된 패턴에서 추가"
            onClose={onClose}
            wide
            footer={
                <>
                    <ZBCButton onClick={onClose}>취소</ZBCButton>
                    <ZBCButton variant="primary" onClick={h_Add} disabled={_V.toAdd.length === 0}>
                        {`추가: ${_V.toAdd.length}개`}
                    </ZBCButton>
                </>
            }
        >
            <div className={styles.PatternPickerDialog} ref={rootRef}>
                <p className={styles.note}>
                    작업을 저장하면 그 작업의 제외 패턴이 여기에 모입니다. 고른 패턴은 편집 칸 끝에 덧붙고,
                    작업을 저장해야 적용됩니다. [목록에서 지우기]는 이 목록에서만 빼며 작업의 패턴은 바꾸지
                    않습니다.
                </p>
                <ZBCInput
                    aria-label="패턴 찾기"
                    value={query}
                    onChange={setQuery}
                    placeholder="찾기"
                    autoFocus
                />
                {loadError !== null ? (
                    <p className={styles.empty}>{`저장된 패턴을 읽지 못했습니다: ${loadError}`}</p>
                ) : patterns === null ? (
                    <p className={styles.empty}>읽는 중…</p>
                ) : patterns.length === 0 ? (
                    <p className={styles.empty}>
                        아직 저장된 패턴이 없습니다. 작업을 저장하면 그 작업의 제외 패턴이 여기에 모입니다.
                    </p>
                ) : _V.shown.length === 0 ? (
                    <p className={styles.empty}>찾는 패턴이 없습니다.</p>
                ) : (
                    <ul className={styles.list} aria-label="저장된 패턴">
                        {_V.shown.map((p) => {
                            const already = have.has(p.pattern);
                            return (
                                <li key={p.pattern} className={styles.row}>
                                    <ZBCCheck
                                        checked={already || picked.has(p.pattern)}
                                        disabled={already}
                                        onChange={(checked) => h_Toggle(p.pattern, checked)}
                                        className={styles.check}
                                    >
                                        <code className={styles.pattern}>{p.pattern}</code>
                                        <span className={styles.meta}>
                                            {already ? "이미 있음" : `작업 저장에 ${p.useCount}번 씀`}
                                        </span>
                                    </ZBCCheck>
                                    <ZBCButton
                                        variant="link"
                                        onClick={() => void h_Forget(p.pattern)}
                                        aria-label={`${p.pattern} 목록에서 지우기`}
                                    >
                                        목록에서 지우기
                                    </ZBCButton>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </ZBCModal>
    );
}
