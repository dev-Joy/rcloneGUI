/**
 *  Format test
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - 폴더 작업 문구 테스트 (F25). 확인하지 못한 폴더 지우기를 "지웠다"고 쓰지 않는다
 */

/**
 *  External imports
 */
import { describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import {
    averageRate,
    describeChanges,
    describeDirs,
    describeSpace,
    dirActionLabel,
    hasChanges,
} from "@/lib/format";
import { emptyCounts, type itfDirCounts } from "@/shared/types";

const f_Dirs = (patch: Partial<itfDirCounts>): itfDirCounts => ({
    make: 0,
    remove: 0,
    kept: 0,
    verified: false,
    ...patch,
});

describe("폴더 작업 문구 (F25)", () => {
    it("미리보기 · 확인 못 한 실행은 대상에만 있는 폴더를 '비어 있으면 지움'으로 쓴다", () => {
        expect(describeDirs({ dirs: f_Dirs({ make: 2, remove: 1 }) })).toBe(
            "폴더 2개 만듦, 대상에만 있는 폴더 1개(비어 있으면 지움)",
        );
        expect(dirActionLabel("delete", { kind: "preview", dirs: f_Dirs({ remove: 1 }) })).toBe(
            "대상에만 있음 · 비어 있으면 지움",
        );
        expect(dirActionLabel("delete", { kind: "execute", dirs: f_Dirs({ remove: 1 }) })).toBe(
            "지우기 시도 (비어 있을 때만)",
        );
    });

    it("확인한 실행은 지운 것과 남은 것을 나눠 쓴다", () => {
        const dirs = f_Dirs({ remove: 1, kept: 2, verified: true });
        expect(describeDirs({ dirs })).toBe("빈 폴더 1개 지움, 폴더 2개 남김(파일이 있음)");
        expect(dirActionLabel("delete", { kind: "execute", dirs })).toBe("빈 폴더 지움");
        expect(dirActionLabel("same", { kind: "execute", dirs })).toBe("남김 (파일이 있음)");
    });

    it("폴더 작업만 있어도 바뀔 것이 있고, 예전 기록(dirs 없음)은 파일만 본다", () => {
        const run = { mode: "sync" as const, counts: emptyCounts() };
        expect(hasChanges({ ...run, dirs: f_Dirs({ make: 1 }) })).toBe(true);
        expect(hasChanges({ ...run, dirs: null })).toBe(false);
        expect(describeChanges({ ...run, dirs: f_Dirs({ make: 3 }) })).toBe("대상에 폴더 3개 만듦");
        expect(describeDirs({ dirs: null })).toBe("");
    });
});

describe("describeSpace (F20)", () => {
    it("여유 / 전체, 모르는 값은 뺀다", () => {
        expect(describeSpace({ total: 2048, used: 1024, free: 1024 })).toBe("여유 1.0 KB / 전체 2.0 KB");
        expect(describeSpace({ total: null, used: null, free: 1024 })).toBe("여유 1.0 KB");
        expect(describeSpace(null)).toBe("용량 확인 불가");
        expect(describeSpace({ total: null, used: 5, free: null })).toBe("용량 확인 불가");
    });
});

describe("averageRate (평균 속도 · 남은 시간)", () => {
    it("보낸 양 ÷ 지난 시간으로 속도를, 그 속도로 남은 시간을 낸다", () => {
        expect(averageRate({ bytes: 1000, totalBytes: 3000, elapsed: 10 })).toEqual({ speed: 100, eta: 20 });
    });

    it("1초가 안 지났거나 보낸 양이 0이면 모른다", () => {
        expect(averageRate({ bytes: 1000, totalBytes: 3000, elapsed: 0.5 })).toEqual({
            speed: null,
            eta: null,
        });
        expect(averageRate({ bytes: 0, totalBytes: 3000, elapsed: 30 })).toEqual({ speed: null, eta: null });
    });

    it("다 보냈으면 남은 시간은 쓰지 않는다", () => {
        expect(averageRate({ bytes: 3000, totalBytes: 3000, elapsed: 30 })).toEqual({
            speed: 100,
            eta: null,
        });
    });
});
