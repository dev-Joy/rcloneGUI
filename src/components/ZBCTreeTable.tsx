/**
 *  ZBC tree table
 *
 *  @author dev-Joy    2026-10-14
 *  @description
 *      - 공용 트리 표. 펼친 줄만 받아 보이는 줄만 그린다 (가상 스크롤)
 *      - 첫 열에 깊이만큼 들여쓰기와 펼침 단추. 칸 내용은 쓰는 쪽이 그린다 (도메인을 모른다)
 */

/**
 *  External imports
 */
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

/**
 *  Props & Types 정의
 */
/** 평탄화된 한 줄. 쓰는 쪽은 이 필드를 가진 자기 타입을 넘긴다 */
export interface itfZBCTreeTableRow {
    id: string;
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
}

export interface itfZBCTreeTableColumn<R> {
    key: string;
    title: ReactNode;
    /** grid-template-columns 한 칸 (예: "minmax(0, 1fr)", "90px") */
    width: string;
    align?: "left" | "center" | "right";
    render: (row: R) => ReactNode;
}

export interface itfZBCTreeTableProps<R extends itfZBCTreeTableRow> {
    rows: R[];
    /** 첫 열이 트리 열이다 (들여쓰기 · 펼침 단추) */
    columns: itfZBCTreeTableColumn<R>[];
    onToggle: (id: string) => void;
    rowHeight?: number;
    /** 깊이 한 단계 들여쓰기 (px) */
    indent?: number;
    emptyText?: ReactNode;
    /** 줄마다 더할 className */
    rowClassName?: (row: R) => string;
    /** 줄 오른쪽 클릭 · 메뉴 키(Shift+F10). 있으면 줄에 키보드 초점이 간다. 좌표는 화면 기준 */
    onRowMenu?: (row: R, x: number, y: number) => void;
    className?: string;
}

const propsDefault = {
    rowHeight: 28,
    indent: 16,
    emptyText: "표시할 항목이 없습니다",
} satisfies Partial<itfZBCTreeTableProps<itfZBCTreeTableRow>>;

/**
 *  내부 함수
 */
const ALIGN_CLASS = {
    left: "",
    center: "zbcTreeTableCenter",
    right: "zbcTreeTableRight",
} as const;

/**
 *  메인 컴포넌트
 */
export default function ZBCTreeTable<R extends itfZBCTreeTableRow>(iProps: itfZBCTreeTableProps<R>) {
    const { rows, columns, onToggle, rowHeight, indent, emptyText, rowClassName, onRowMenu, className } = {
        ...propsDefault,
        ...iProps,
    };

    //
    // hook & state 변수 선언
    //

    /** 스크롤 영역 */
    const scrollRef = useRef<HTMLDivElement>(null);

    /** 보이는 줄만 계산한다. 이 앱은 React Compiler를 쓰지 않으므로 메모이제이션 경고는 해당하지 않는다. */
    // oxlint-disable-next-line react/incompatible-library
    const virtualizer = useVirtualizer({
        count: rows.length,
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
        className: ["zbc", "zbcTreeTable", className ?? ""].filter(Boolean).join(" "),
        grid: {
            gridTemplateColumns: columns.map((column) => column.width).join(" "),
        } satisfies CSSProperties,
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 칸 className */
    function f_CellClass(column: itfZBCTreeTableColumn<R>) {
        return ["zbcTreeTableCell", ALIGN_CLASS[column.align ?? "left"]].filter(Boolean).join(" ");
    }

    /** 첫 열: 들여쓰기, 펼침 단추, 내용 */
    function f_TreeCell(row: R, column: itfZBCTreeTableColumn<R>) {
        return (
            <span
                className={`${f_CellClass(column)} zbcTreeTableTreeCell`}
                style={{ paddingLeft: row.depth * indent }}
            >
                {row.hasChildren ? (
                    <button
                        type="button"
                        className="zbcTreeTableToggle"
                        aria-expanded={row.expanded}
                        aria-label={row.expanded ? "접기" : "펼치기"}
                        onClick={() => onToggle(row.id)}
                        // 단추를 빠르게 두 번 누르면 클릭 두 번으로 이미 원래대로다. 줄 더블클릭이 한 번 더 뒤집지 않게 한다.
                        onDoubleClick={(event) => event.stopPropagation()}
                    >
                        {row.expanded ? "▾" : "▸"}
                    </button>
                ) : (
                    <span className="zbcTreeTableToggleSpacer" />
                )}
                <span className="zbcTreeTableTreeContent">{column.render(row)}</span>
            </span>
        );
    }

    /** 메뉴 키 · Shift+F10이면 줄 왼쪽 아래에 메뉴를 연다 */
    function h_RowKeyDown(row: R, event: KeyboardEvent<HTMLDivElement>) {
        if (!onRowMenu) return;
        if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onRowMenu(row, rect.left + 24, rect.bottom);
    }

    /** 폴더 줄을 더블클릭하면 접고 편다 */
    function h_DoubleClick(row: R) {
        if (row.hasChildren) onToggle(row.id);
    }

    return (
        <div className={_V.className} role="treegrid" aria-rowcount={rows.length}>
            <div className="zbcTreeTableHead" style={_V.grid} role="row">
                {columns.map((column) => (
                    <span key={column.key} className={f_CellClass(column)} role="columnheader">
                        {column.title}
                    </span>
                ))}
            </div>
            <div className="zbcTreeTableScroll" ref={scrollRef}>
                {rows.length === 0 ? (
                    <div className="zbcTreeTableEmpty">{emptyText}</div>
                ) : (
                    <div className="zbcTreeTableRows" style={{ height: virtualizer.getTotalSize() }}>
                        {virtualizer.getVirtualItems().map((virtual) => {
                            const row = rows[virtual.index];
                            return (
                                <div
                                    key={row.id}
                                    role="row"
                                    aria-level={row.depth + 1}
                                    aria-expanded={row.hasChildren ? row.expanded : undefined}
                                    className={["zbcTreeTableRow", rowClassName?.(row) ?? ""]
                                        .filter(Boolean)
                                        .join(" ")}
                                    style={{
                                        ..._V.grid,
                                        height: rowHeight,
                                        transform: `translateY(${virtual.start}px)`,
                                    }}
                                    onDoubleClick={() => h_DoubleClick(row)}
                                    tabIndex={onRowMenu ? 0 : undefined}
                                    onContextMenu={
                                        onRowMenu
                                            ? (event) => {
                                                  event.preventDefault();
                                                  onRowMenu(row, event.clientX, event.clientY);
                                              }
                                            : undefined
                                    }
                                    onKeyDown={(event) => h_RowKeyDown(row, event)}
                                >
                                    {columns.map((column, index) =>
                                        index === 0 ? (
                                            <span
                                                key={column.key}
                                                role="gridcell"
                                                className="zbcTreeTableCellWrap"
                                            >
                                                {f_TreeCell(row, column)}
                                            </span>
                                        ) : (
                                            <span
                                                key={column.key}
                                                role="gridcell"
                                                className={f_CellClass(column)}
                                            >
                                                {column.render(row)}
                                            </span>
                                        ),
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
