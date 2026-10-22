/**
 *  List views test
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - 비교 결과 "기타" 보기 (F22): 새로 생김 · 아직 실행되지 않음 · 제외됨 계산과 문구, 트리의 제외 수
 */

/**
 *  External imports
 */
import { describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { buildFileTree } from "@/lib/file-tree";
import { actionArrow, itemActionLabel } from "@/lib/format";
import { baselineExecute, excludedItems, newSince, pendingAfter, viewProblem } from "@/lib/list-views";
import { diffExcluded } from "@/main/rclone/excluded";
import { emptyCounts, type itfFileItem, type itfRunMeta } from "@/shared/types";

/**
 *  내부 함수
 */
function f_Run(patch: Partial<itfRunMeta>): itfRunMeta {
    return {
        runId: "20261016-100000",
        jobId: "job-a",
        kind: "preview",
        status: "success",
        exitCode: 0,
        counts: emptyCounts(),
        startedAt: "2026-10-16T10:00:00.000Z",
        endedAt: "2026-10-16T10:00:05.000Z",
        jobHash: "h",
        command: "rclone",
        mode: "sync",
        backupDir: null,
        previewRunId: null,
        blocked: null,
        message: "",
        errors: [],
        details: null,
        dirs: null,
        trigger: "manual",
        space: null,
        snapshot: null,
        ...patch,
    };
}

const f_Item = (
    path: string,
    status: itfFileItem["status"],
    extra: Partial<itfFileItem> = {},
): itfFileItem => ({
    path,
    status,
    ...extra,
});

describe("새로 생김 (F22)", () => {
    const preview = f_Run({ runId: "p2", startedAt: "2026-10-16T12:00:00.000Z" });

    it("기준은 이 미리보기보다 먼저 끝난 마지막 성공한 실제 동기화다", () => {
        const failed = f_Run({
            runId: "e3",
            kind: "execute",
            status: "failed",
            previewRunId: "p1",
            endedAt: "2026-10-16T11:30:00.000Z",
        });
        const ok = f_Run({
            runId: "e2",
            kind: "execute",
            previewRunId: "p1",
            endedAt: "2026-10-16T11:00:00.000Z",
        });
        const later = f_Run({
            runId: "e4",
            kind: "execute",
            previewRunId: "p2",
            endedAt: "2026-10-16T12:10:00.000Z",
        });
        expect(baselineExecute([later, failed, ok], preview)?.runId).toBe("e2");
        expect(baselineExecute([later, failed], preview)).toBeNull();
    });

    it("추가 파일 중 기준 미리보기의 원본 쪽에 없던 것만. 대상에서 지워져 다시 복사되는 파일은 빠진다", () => {
        const baseline = [
            f_Item("kept.txt", "same"),
            f_Item("again.txt", "add"),
            f_Item("dest-only.txt", "delete"),
            f_Item("dir", "add", { isDir: true }),
        ];
        const items = [
            f_Item("again.txt", "add"),
            f_Item("brand-new.txt", "add"),
            f_Item("dest-only.txt", "add"),
            f_Item("kept.txt", "change"),
            f_Item("dir2", "add", { isDir: true }),
        ];
        expect(newSince(items, baseline).map((i) => i.path)).toEqual(["brand-new.txt", "dest-only.txt"]);
    });
});

describe("아직 실행되지 않음 (F22)", () => {
    const preview = [
        f_Item("a.txt", "add"),
        f_Item("b.txt", "change"),
        f_Item("c.txt", "delete"),
        f_Item("d.txt", "same"),
        f_Item("e.txt", "add"),
        f_Item("dir", "add", { isDir: true }),
    ];

    it("할 일이었는데 실행 목록에 같은 상태로 없으면 처리 안 됨", () => {
        const executed = [f_Item("a.txt", "add"), f_Item("b.txt", "error"), f_Item("d.txt", "same")];
        expect(pendingAfter(preview, executed, "sync")).toEqual([
            { path: "b.txt", status: "change", note: "pending" },
            { path: "c.txt", status: "delete", note: "pending" },
            { path: "e.txt", status: "add", note: "pending" },
        ]);
    });

    it("copy는 대상에만 있는 파일을 할 일로 보지 않는다", () => {
        expect(pendingAfter(preview, preview, "copy")).toEqual([]);
        expect(pendingAfter(preview, [], "copy").map((i) => i.path)).toEqual(["a.txt", "b.txt", "e.txt"]);
    });
});

describe("제외됨 (F22)", () => {
    const side = (size: number) => ({ size, modTime: "2026-10-16T10:00:00+09:00" });

    it("필터 없는 양쪽 목록에서 미리보기 파일을 뺀다. 경로 순, 한쪽에만 있으면 다른 쪽은 null", () => {
        const source = new Map([
            ["same.txt", side(1)],
            ["node_modules/pkg/index.js", side(2)],
            ["build/a10.log", side(3)],
            ["build/a2.log", side(4)],
        ]);
        const dest = new Map([
            ["same.txt", side(1)],
            ["node_modules/pkg/index.js", side(5)],
            ["node_modules/pkg/old.js", side(6)],
        ]);
        const items = [f_Item("same.txt", "same"), f_Item("node_modules", "add", { isDir: true })];
        expect(diffExcluded(source, dest, items)).toEqual([
            { path: "build/a2.log", source: side(4), dest: null },
            { path: "build/a10.log", source: side(3), dest: null },
            { path: "node_modules/pkg/index.js", source: side(2), dest: side(5) },
            { path: "node_modules/pkg/old.js", source: null, dest: side(6) },
        ]);
    });

    it("목록 항목으로 바꾸면 note가 붙고, 트리 폴더는 상태 건수 대신 제외 수를 센다", () => {
        const items = excludedItems([{ path: "node_modules/x.js", source: side(1), dest: null }]);
        expect(items).toEqual([
            { path: "node_modules/x.js", status: "same", source: side(1), dest: null, note: "excluded" },
        ]);
        const root = buildFileTree(items);
        expect(root.excluded).toBe(1);
        expect(root.counts).toEqual(emptyCounts());
    });
});

describe("보기 문구와 쓸 수 있는 실행 (F22)", () => {
    it("제외됨 · 처리 안 됨 문구", () => {
        const run = f_Run({});
        expect(itemActionLabel({ status: "same", note: "excluded" }, run, true)).toBe(
            "제외 패턴에 걸림 · 건드리지 않음",
        );
        expect(itemActionLabel({ status: "add", note: "pending" }, run, true)).toBe("새로 복사 · 처리 못 함");
        expect(itemActionLabel({ status: "delete" }, run, true)).toBe("삭제 → 백업");
    });

    it("보기마다 쓸 수 있는 실행이 정해져 있다", () => {
        const preview = f_Run({});
        const failedPreview = f_Run({ status: "failed" });
        const execute = f_Run({ runId: "e1", kind: "execute", previewRunId: "p1" });
        expect(viewProblem("included", failedPreview, [])).toBeNull();
        expect(viewProblem("excluded", preview, [])).toBeNull();
        expect(viewProblem("excluded", failedPreview, [])).not.toBeNull();
        expect(viewProblem("excluded", execute, [])).not.toBeNull();
        expect(viewProblem("new", preview, [])).not.toBeNull();
        expect(viewProblem("new", f_Run({ startedAt: "2026-10-17T00:00:00.000Z" }), [execute])).toBeNull();
        expect(viewProblem("pending", execute, [])).toBeNull();
        expect(viewProblem("pending", preview, [])).not.toBeNull();
        expect(viewProblem("pending", { ...execute, status: "running" }, [])).not.toBeNull();
    });
});

describe("방향 기호 (F23)", () => {
    it("추가 · 변경 →, sync 삭제 ✕, copy 대상에만 · 폴더 · 제외됨은 없음", () => {
        expect(actionArrow({ status: "add" }, "sync")).toBe("→");
        expect(actionArrow({ status: "change" }, "copy")).toBe("→");
        expect(actionArrow({ status: "delete" }, "sync")).toBe("✕");
        expect(actionArrow({ status: "delete" }, "copy")).toBe("");
        expect(actionArrow({ status: "same" }, "sync")).toBe("=");
        expect(actionArrow({ status: "error" }, "sync")).toBe("!");
        expect(actionArrow({ status: "add", isDir: true }, "sync")).toBe("");
        expect(actionArrow({ status: "same", note: "excluded" }, "sync")).toBe("");
    });
});
