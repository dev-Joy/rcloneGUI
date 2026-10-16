/**
 *  File tree
 *
 *  @author dev-Joy    2026-10-14
 *  @description
 *      - 비교 항목(경로 목록)을 폴더 트리로 만들고 폴더별로 집계한다 (F19)
 *      - 화면에 그릴 줄 목록으로 평탄화한다. DOM · React와 무관한 순수 함수
 */

/**
 *  Internal imports
 */
import { emptyCounts, isDestNewer, type itfFileItem, type typCounts } from "@/shared/types";

/**
 *  Types 정의
 */
export interface itfTreeFile {
    kind: "file";
    /** 전체 경로 (combined와 같은 형식) */
    id: string;
    name: string;
    item: itfFileItem;
}

export interface itfTreeFolder {
    kind: "folder";
    /** 전체 경로. 뿌리는 "" */
    id: string;
    name: string;
    children: typTreeNode[];
    /** 그 아래 모든 파일의 상태별 건수 */
    counts: typCounts;
    /** 그 아래 파일의 원본 크기 합. 상세가 있는 파일이 하나도 없으면 null */
    sourceSize: number | null;
    /** 대상 크기 합. 의미는 sourceSize와 같다 */
    destSize: number | null;
    /** 대상이 더 최신인데 덮어쓸 파일 수 */
    newer: number;
    /** 그 아래 제외된 파일 수 (F22 기타 → 제외됨). 상태별 건수에는 넣지 않는다 */
    excluded: number;
    /** 이 폴더 자체의 작업 (F25). add 폴더 만듦, delete 대상에만 있음(비어 있으면 지움), same 지우려 했지만 남음 */
    dirOp?: "add" | "delete" | "same";
}

export type typTreeNode = itfTreeFile | itfTreeFolder;

/** 화면에 그릴 한 줄 */
export interface itfTreeRow {
    /** 줄 ID. 같은 경로의 파일과 폴더가 함께 나올 수 있어(원본은 파일, 대상은 폴더) 종류를 앞에 붙인다 */
    id: string;
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
    node: typTreeNode;
}

/** 이름 순서. 실행 환경 로캘과 무관하게 같게 하려고 고정한다 (영문 → 한글, 숫자는 크기 순: a2 < a10) */
const NAME_ORDER = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** 모두 펼쳤을 때 줄이 이보다 많으면 처음에는 폴더를 접어 둔다 */
export const TREE_EXPAND_LIMIT = 5000;

/**
 *  내부 함수
 */
function f_NewFolder(id: string, name: string): itfTreeFolder {
    return {
        kind: "folder",
        id,
        name,
        children: [],
        counts: emptyCounts(),
        sourceSize: null,
        destSize: null,
        newer: 0,
        excluded: 0,
    };
}

const f_AddSize = (total: number | null, size: number | undefined): number | null =>
    size === undefined ? total : (total ?? 0) + size;

/** 폴더 먼저, 그다음 파일. 각각 이름 순 */
function f_Sort(folder: itfTreeFolder): void {
    folder.children.sort((a, b) =>
        a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : NAME_ORDER.compare(a.name, b.name),
    );
    for (const child of folder.children) if (child.kind === "folder") f_Sort(child);
}

/**
 *  메인 클래스 / export 함수
 */
/** 폴더 줄의 ID. 접힌 폴더 목록(collapsed)도 이 ID로 담는다 */
export const folderRowId = (path: string): string => `d:${path}`;

/** 파일 줄의 ID */
export const fileRowId = (path: string): string => `f:${path}`;

/** 항목을 폴더 트리로. 폴더는 경로(`/` 구분)에서 만든다. 뿌리 폴더를 돌려준다. */
export function buildFileTree(items: readonly itfFileItem[]): itfTreeFolder {
    const root = f_NewFolder("", "");
    const folders = new Map<string, itfTreeFolder>([["", root]]);

    for (const item of items) {
        const parts = item.path.split("/");
        const chain: itfTreeFolder[] = [root];
        let parent = root;
        // 폴더 작업 항목(F25)은 경로 전체가 폴더다. 파일 건수 · 크기에는 넣지 않는다.
        const folderDepth = item.isDir ? parts.length : parts.length - 1;
        for (let i = 0; i < folderDepth; i += 1) {
            const id = parts.slice(0, i + 1).join("/");
            let folder = folders.get(id);
            if (!folder) {
                folder = f_NewFolder(id, parts[i]);
                folders.set(id, folder);
                parent.children.push(folder);
            }
            chain.push(folder);
            parent = folder;
        }
        if (item.isDir) {
            if (item.status === "add" || item.status === "delete" || item.status === "same")
                parent.dirOp = item.status;
            continue;
        }
        parent.children.push({ kind: "file", id: item.path, name: parts[parts.length - 1], item });

        const newer = isDestNewer(item);
        for (const folder of chain) {
            if (item.note === "excluded") folder.excluded += 1;
            else folder.counts[item.status] += 1;
            folder.sourceSize = f_AddSize(folder.sourceSize, item.source?.size);
            folder.destSize = f_AddSize(folder.destSize, item.dest?.size);
            if (newer) folder.newer += 1;
        }
    }
    f_Sort(root);
    return root;
}

/** 접힌 폴더 아래는 건너뛰고 화면에 그릴 줄 목록을 만든다. 뿌리 자신은 줄이 아니다. */
export function flattenTree(root: itfTreeFolder, collapsed: ReadonlySet<string>): itfTreeRow[] {
    const rows: itfTreeRow[] = [];
    const f_Walk = (folder: itfTreeFolder, depth: number): void => {
        for (const node of folder.children) {
            const isFolder = node.kind === "folder";
            const id = isFolder ? folderRowId(node.id) : fileRowId(node.id);
            const expanded = isFolder && !collapsed.has(id);
            rows.push({ id, depth, hasChildren: isFolder, expanded, node });
            if (isFolder && expanded) f_Walk(node, depth + 1);
        }
    };
    f_Walk(root, 0);
    return rows;
}

/** 트리의 모든 폴더 줄 ID (모두 접기용) */
export function folderIds(root: itfTreeFolder): string[] {
    const ids: string[] = [];
    const f_Walk = (folder: itfTreeFolder): void => {
        for (const node of folder.children) {
            if (node.kind !== "folder") continue;
            ids.push(folderRowId(node.id));
            f_Walk(node);
        }
    };
    f_Walk(root);
    return ids;
}

/** 처음 접어 둘 폴더. 모두 펼쳐 limit 줄을 넘으면 모든 폴더를 접어 맨 위 단계만 보이게 한다. */
export function initialCollapsed(root: itfTreeFolder, limit = TREE_EXPAND_LIMIT): Set<string> {
    return flattenTree(root, new Set()).length > limit ? new Set(folderIds(root)) : new Set();
}
