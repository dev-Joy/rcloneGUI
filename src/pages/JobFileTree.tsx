/**
 *  Job file tree
 *
 *  @author dev-Joy    2026-10-14
 *  @description
 *      - 비교 결과를 폴더 트리 표로 보여준다 (F19)
 *      - 폴더 줄에 그 아래 일어날 일의 건수와 크기 합계. 접기 · 펴기, 모두 펼치기 · 접기
 */

/**
 *  External imports
 */
import { useMemo, useState } from "react";

/**
 *  Internal imports
 */
import ZBCBadge from "@/components/ZBCBadge";
import ZBCButton from "@/components/ZBCButton";
import ZBCTreeTable, { type itfZBCTreeTableColumn } from "@/components/ZBCTreeTable";
import {
    buildFileTree,
    flattenTree,
    folderIds,
    initialCollapsed,
    type itfTreeFile,
    type itfTreeFolder,
    type itfTreeRow,
} from "@/lib/file-tree";
import { actionLabel, countsLine, dirActionLabel, formatBytes, formatDateTime } from "@/lib/format";
import { isDestNewer, type itfFileItem, type itfFileSide, type itfRunMeta } from "@/shared/types";
import styles from "./JobFileTree.module.css";

/**
 *  Props & Types 정의
 */
export interface itfJobFileTreeProps {
    /** 상태 칩 필터를 적용한 항목 */
    items: itfFileItem[];
    run: itfRunMeta;
    /** 작업의 백업 설정 (미리보기 문구용) */
    backup: boolean;
    emptyText: string;
}

const propsDefault = {} satisfies Partial<itfJobFileTreeProps>;

/**
 *  내부 함수
 */
/** 크기 칸. null이면 비운다 */
function f_Size(size: number | null | undefined) {
    return size === null || size === undefined ? "" : formatBytes(size);
}

/** 수정 시각 칸 */
function f_Time(side: itfFileSide | null | undefined) {
    return side ? formatDateTime(side.modTime) : "";
}

/**
 *  메인 컴포넌트
 */
export default function JobFileTree(iProps: itfJobFileTreeProps) {
    const { items, run, backup, emptyText } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    /** 항목에서 만든 트리. 필터가 바뀌면 다시 만든다 */
    const tree = useMemo(() => buildFileTree(items), [items]);
    /** 접힌 폴더 줄 ID. 처음에는 줄이 많으면 모두 접는다 (실행이 바뀌면 부모가 key로 새로 만든다) */
    const [collapsed, setCollapsed] = useState<Set<string>>(() => initialCollapsed(tree));
    /** 그릴 줄. 진행 이벤트 등으로 다시 그려질 때 2만 줄을 다시 만들지 않게 기억한다 */
    const rows = useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);

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

    /** 원본에 없는 파일인지 (상세가 없어도 상태로 안다) */
    function f_SourceMissing(file: itfTreeFile) {
        return file.item.source === null || file.item.status === "delete";
    }

    /** 대상에 없는 파일인지 */
    function f_DestMissing(file: itfTreeFile) {
        return file.item.dest === null || (file.item.status === "add" && !_V.executed);
    }

    /** "없음" 표시 */
    function f_Missing() {
        return <span className={styles.missing}>없음</span>;
    }

    /** 폴더 줄의 일어날 일 요약 */
    function f_FolderSummary(folder: itfTreeFolder) {
        return (
            <span className={styles.summary} title={countsLine(folder.counts, run.mode)}>
                {folder.dirOp && <ZBCBadge tone={folder.dirOp}>{dirActionLabel(folder.dirOp, run)}</ZBCBadge>}
                <span className={styles.summaryText}>{countsLine(folder.counts, run.mode)}</span>
                {folder.newer > 0 && <span className={styles.newer}>대상이 더 최신 {folder.newer}</span>}
            </span>
        );
    }

    /** 파일 줄의 일어날 일 */
    function f_FileAction(file: itfTreeFile) {
        const label = actionLabel(file.item.status, run, backup);
        const newer = isDestNewer(file.item);
        return (
            <span className={styles.action} title={newer ? `${label} · 대상이 더 최신` : label}>
                <ZBCBadge tone={file.item.status}>{label}</ZBCBadge>
                {newer && (
                    <span
                        className={styles.newer}
                        title={`원본 ${f_Time(file.item.source)}\n대상 ${f_Time(file.item.dest)}`}
                    >
                        대상이 더 최신
                    </span>
                )}
            </span>
        );
    }

    const columns: itfZBCTreeTableColumn<itfTreeRow>[] = [
        {
            key: "name",
            title: "항목",
            // 이름이 사라지지 않게 최소 폭을 두고, 남는 폭은 일어날 일 열과 나눠 갖는다
            width: "minmax(160px, 3fr)",
            render: (row) =>
                row.node.kind === "folder" ? (
                    <span className={styles.folder} title={row.node.id}>
                        {row.node.name}
                    </span>
                ) : (
                    <span className={styles.file} title={row.node.id}>
                        {row.node.name}
                    </span>
                ),
        },
        {
            key: "sourceSize",
            title: "원본 크기",
            width: "minmax(56px, 84px)",
            align: "right",
            render: (row) =>
                row.node.kind === "folder"
                    ? f_Size(row.node.sourceSize)
                    : f_SourceMissing(row.node)
                      ? f_Missing()
                      : f_Size(row.node.item.source?.size),
        },
        {
            key: "sourceTime",
            title: "원본 수정 시각",
            width: "minmax(0, 112px)",
            render: (row) => (row.node.kind === "file" ? f_Time(row.node.item.source) : ""),
        },
        {
            key: "action",
            title: "일어날 일",
            // "원본으로 덮어씀" 배지와 "대상이 더 최신"이 함께 들어가는 폭(약 180px). 좁으면 시각 열이 먼저 줄어든다
            width: "minmax(190px, 1.6fr)",
            align: "center",
            render: (row) =>
                row.node.kind === "folder" ? f_FolderSummary(row.node) : f_FileAction(row.node),
        },
        {
            key: "destTime",
            title: "대상 수정 시각",
            width: "minmax(0, 112px)",
            render: (row) => (row.node.kind === "file" ? f_Time(row.node.item.dest) : ""),
        },
        {
            key: "destSize",
            title: "대상 크기",
            width: "minmax(56px, 84px)",
            align: "right",
            render: (row) =>
                row.node.kind === "folder"
                    ? f_Size(row.node.destSize)
                    : f_DestMissing(row.node)
                      ? f_Missing()
                      : f_Size(row.node.item.dest?.size),
        },
    ];

    /** 폴더 하나를 접거나 편다 */
    function h_Toggle(id: string) {
        setCollapsed((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    /** 모든 폴더를 편다 */
    function h_ExpandAll() {
        setCollapsed(new Set());
    }

    /** 모든 폴더를 접는다 */
    function h_CollapseAll() {
        setCollapsed(new Set(folderIds(tree)));
    }

    return (
        <div className={styles.JobFileTree}>
            <div className={styles.tools}>
                <ZBCButton variant="link" onClick={h_ExpandAll}>
                    모두 펼치기
                </ZBCButton>
                <ZBCButton variant="link" onClick={h_CollapseAll}>
                    모두 접기
                </ZBCButton>
            </div>
            <ZBCTreeTable
                rows={rows}
                columns={columns}
                onToggle={h_Toggle}
                emptyText={emptyText}
                rowClassName={(row) => (row.node.kind === "file" ? (styles[row.node.item.status] ?? "") : "")}
            />
        </div>
    );
}
