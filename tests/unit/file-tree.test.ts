/**
 *  File tree test
 *
 *  @author dev-Joy    2026-10-14
 *  @description
 *      - 비교 트리 만들기 · 집계 · 평탄화 테스트 (F19)
 */

/**
 *  External imports
 */
import { describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import {
    buildFileTree,
    flattenTree,
    folderIds,
    folderRowId,
    initialCollapsed,
    type itfTreeFolder,
} from "@/lib/file-tree";
import type { itfFileItem } from "@/shared/types";

/**
 *  내부 함수
 */
const f_Side = (size: number, modTime = "2026-10-14T10:00:00+09:00") => ({ size, modTime });

const ITEMS: itfFileItem[] = [
    { path: "b.txt", status: "add", source: f_Side(2), dest: null },
    { path: "dst/a b.txt", status: "add", source: f_Side(2), dest: null },
    {
        path: "dst/changed.txt",
        status: "change",
        source: f_Side(3, "2026-10-14T10:00:00+09:00"),
        dest: f_Side(5, "2026-10-14T11:00:00+09:00"),
    },
    { path: "dst/sub/deep.txt", status: "delete", source: null, dest: f_Side(4) },
    { path: "dst/sub/same.txt", status: "same", source: f_Side(6), dest: f_Side(6) },
    { path: "한글 폴더/파일.txt", status: "add", source: f_Side(1), dest: null },
];

const f_Folder = (root: itfTreeFolder, id: string): itfTreeFolder => {
    const found = flattenTree(root, new Set()).find(
        (row) => row.node.id === id && row.node.kind === "folder",
    )?.node;
    if (!found || found.kind !== "folder") throw new Error(`폴더 없음: ${id}`);
    return found;
};

describe("buildFileTree", () => {
    it("경로에서 폴더를 만들고 폴더 먼저, 이름 순으로 놓는다", () => {
        const root = buildFileTree(ITEMS);
        expect(root.children.map((n) => `${n.kind}:${n.name}`)).toEqual([
            "folder:dst",
            "folder:한글 폴더",
            "file:b.txt",
        ]);
        expect(f_Folder(root, "dst").children.map((n) => n.name)).toEqual(["sub", "a b.txt", "changed.txt"]);
        expect(f_Folder(root, "dst/sub").id).toBe("dst/sub");
    });

    it("폴더마다 그 아래 모든 파일의 건수 · 크기 합 · 대상이 더 최신인 수를 센다", () => {
        const root = buildFileTree(ITEMS);
        const dst = f_Folder(root, "dst");
        expect(dst.counts).toEqual({ add: 1, change: 1, delete: 1, same: 1, error: 0 });
        expect(dst.sourceSize).toBe(2 + 3 + 6);
        expect(dst.destSize).toBe(5 + 4 + 6);
        expect(dst.newer).toBe(1);
        expect(f_Folder(root, "dst/sub").newer).toBe(0);
        expect(root.counts.add).toBe(3);
    });

    it("상세가 없는 항목뿐이면 크기 합은 null", () => {
        const root = buildFileTree([{ path: "x/a.txt", status: "add" }]);
        expect(f_Folder(root, "x")).toMatchObject({ sourceSize: null, destSize: null });
    });

    it("숫자는 크기 순으로 놓는다", () => {
        const root = buildFileTree([
            { path: "a10.txt", status: "add" },
            { path: "a2.txt", status: "add" },
        ]);
        expect(root.children.map((n) => n.name)).toEqual(["a2.txt", "a10.txt"]);
    });

    it("빈 목록은 빈 뿌리", () => {
        expect(buildFileTree([]).children).toEqual([]);
    });
});

describe("flattenTree", () => {
    it("모두 펼치면 깊이 순서대로 모든 줄", () => {
        const rows = flattenTree(buildFileTree(ITEMS), new Set());
        expect(rows.map((r) => `${r.depth}:${r.node.id}`)).toEqual([
            "0:dst",
            "1:dst/sub",
            "2:dst/sub/deep.txt",
            "2:dst/sub/same.txt",
            "1:dst/a b.txt",
            "1:dst/changed.txt",
            "0:한글 폴더",
            "1:한글 폴더/파일.txt",
            "0:b.txt",
        ]);
        expect(rows[0]).toMatchObject({ hasChildren: true, expanded: true });
        expect(rows.at(-1)).toMatchObject({ hasChildren: false, expanded: false });
    });

    it("접힌 폴더 아래는 건너뛴다", () => {
        const rows = flattenTree(
            buildFileTree(ITEMS),
            new Set([folderRowId("dst/sub"), folderRowId("한글 폴더")]),
        );
        expect(rows.map((r) => r.node.id)).toEqual([
            "dst",
            "dst/sub",
            "dst/a b.txt",
            "dst/changed.txt",
            "한글 폴더",
            "b.txt",
        ]);
        expect(rows.find((r) => r.id === folderRowId("dst/sub"))?.expanded).toBe(false);
    });
});

describe("폴더 작업 (F25)", () => {
    it("폴더 작업 항목은 그 폴더 줄에 표시하고 파일 건수에는 넣지 않는다", () => {
        const root = buildFileTree([
            { path: "a/new/inner", status: "add", isDir: true },
            { path: "old", status: "delete", isDir: true },
            { path: "a/f.txt", status: "add" },
        ]);
        expect(f_Folder(root, "a/new/inner").dirOp).toBe("add");
        expect(f_Folder(root, "a/new").dirOp).toBeUndefined();
        expect(f_Folder(root, "old")).toMatchObject({ dirOp: "delete", children: [] });
        expect(f_Folder(root, "a").counts.add).toBe(1);
        expect(root.counts.delete).toBe(0);
    });
});

describe("줄 ID", () => {
    it("같은 경로의 파일과 폴더가 함께 나와도 줄 ID는 겹치지 않는다", () => {
        // 원본에는 파일 x, 대상에는 폴더 x/ 가 있는 경우
        const rows = flattenTree(
            buildFileTree([
                { path: "x", status: "add" },
                { path: "x/y", status: "delete" },
            ]),
            new Set(),
        );
        expect(rows.map((r) => r.node.id)).toEqual(["x", "x/y", "x"]);
        expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    });
});

describe("initialCollapsed", () => {
    it("기준 줄 수 이하면 모두 펼치고, 넘으면 모든 폴더를 접는다", () => {
        const root = buildFileTree(ITEMS);
        expect(initialCollapsed(root, 9).size).toBe(0);
        expect([...initialCollapsed(root, 8)].sort()).toEqual([...folderIds(root)].sort());
        expect(flattenTree(root, initialCollapsed(root, 8)).map((r) => r.node.id)).toEqual([
            "dst",
            "한글 폴더",
            "b.txt",
        ]);
    });
});
