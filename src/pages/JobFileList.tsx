/**
 *  Job file list
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - 원본 · 일어날 일 · 대상 3열 비교 목록
 *      - 수만 줄도 보이는 줄만 그린다 (가상 스크롤)
 */

/**
 *  External imports
 */
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

/**
 *  Internal imports
 */
import ZBCBadge from "@/components/ZBCBadge";
import { actionLabel } from "@/lib/format";
import type { itfFileItem, itfRunMeta } from "@/shared/types";
import styles from "./JobFileList.module.css";

/**
 *  Props & Types 정의
 */
export interface itfJobFileListProps {
    items: itfFileItem[];
    run: itfRunMeta;
    /** 작업의 백업 설정 (미리보기 문구용) */
    backup: boolean;
    emptyText: string;
    rowHeight?: number;
}

const propsDefault = {
    rowHeight: 28,
} satisfies Partial<itfJobFileListProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function JobFileList(iProps: itfJobFileListProps) {
    const { items, run, backup, emptyText, rowHeight } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    /** 스크롤 영역 */
    const scrollRef = useRef<HTMLDivElement>(null);

    /** 보이는 줄만 계산한다. 이 앱은 React Compiler를 쓰지 않으므로 메모이제이션 경고는 해당하지 않는다. */
    // oxlint-disable-next-line react/incompatible-library
    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => rowHeight,
        overscan: 20,
    });

    //
    // Effect (부수 효과)
    //

    //
    // 내부 변수
    //
    const _V = {
        /** 실행 기록이면 추가한 파일도 대상에 이미 있다 */
        executed: run.kind === "execute",
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 원본 쪽 칸. 원본에 없는 파일은 비운다 */
    function f_SourceCell(item: itfFileItem) {
        return item.status !== "delete" ? item.path : <span className={styles.missing}>없음</span>;
    }

    /** 대상 쪽 칸. 대상에 아직 없는 파일은 비운다 */
    function f_DestCell(item: itfFileItem) {
        return item.status !== "add" || _V.executed ? (
            item.path
        ) : (
            <span className={styles.missing}>없음</span>
        );
    }

    return (
        <div className={styles.JobFileList}>
            <div className={styles.head}>
                <span>원본</span>
                <span className={styles.headAction}>일어날 일</span>
                <span>대상</span>
            </div>
            <div className={styles.scroll} ref={scrollRef}>
                {items.length === 0 ? (
                    <div className={styles.empty}>{emptyText}</div>
                ) : (
                    <div className={styles.rows} style={{ height: virtualizer.getTotalSize() }}>
                        {virtualizer.getVirtualItems().map((row) => {
                            const item = items[row.index];
                            return (
                                <div
                                    key={item.path}
                                    className={`${styles.row} ${styles[item.status] ?? ""}`}
                                    style={{ height: rowHeight, transform: `translateY(${row.start}px)` }}
                                >
                                    <span className={styles.path} title={item.path}>
                                        {f_SourceCell(item)}
                                    </span>
                                    <ZBCBadge tone={item.status}>
                                        {actionLabel(item.status, run, backup)}
                                    </ZBCBadge>
                                    <span className={styles.path} title={item.path}>
                                        {f_DestCell(item)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
