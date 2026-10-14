/**
 *  Paths test
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 경로 해석·겹침 검사·백업 경로 테스트
 */

/**
 *  External imports
 */
import { describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import {
    backupDirFor,
    backupRoot,
    destKey,
    isRemote,
    parseLocation,
    pathsOverlap,
} from "@/main/rclone/paths";

describe("parseLocation", () => {
    it.each(["C:\\work\\dir", "C:/work/dir", "\\\\server\\share\\dir", "relative\\dir", "C:dir"])(
        "%s 는 로컬이다",
        (path) => {
            expect(parseLocation(path)).toEqual({ kind: "local", path });
        },
    );

    it("이름:경로는 리모트다", () => {
        expect(parseLocation("remote-x:My Projects")).toEqual({
            kind: "remote",
            remote: "remote-x",
            path: "My Projects",
        });
        expect(parseLocation("remote-x:")).toEqual({ kind: "remote", remote: "remote-x", path: "" });
        expect(isRemote("remote-x:a/b")).toBe(true);
    });

    it("경로 안쪽의 콜론은 리모트로 보지 않는다", () => {
        expect(isRemote("C:\\work\\a:b")).toBe(false);
        expect(isRemote("\\\\server\\share\\name:x")).toBe(false);
    });
});

describe("pathsOverlap", () => {
    it.each([
        ["C:\\work", "C:\\work"],
        ["C:\\work", "c:\\WORK\\"],
        ["C:\\work", "C:\\work\\sub"],
        ["C:\\work\\sub\\deep", "C:/work"],
        ["C:\\", "C:\\anything"],
        ["\\\\server\\share\\a", "\\\\SERVER\\share\\a\\b"],
        ["remote-x:a", "remote-x:a/b"],
        ["remote-x:", "remote-x:a"],
        ["remote-x:a/", "remote-x:a"],
    ])("%s 와 %s 는 겹친다", (a, b) => {
        expect(pathsOverlap(a, b)).toBe(true);
        expect(pathsOverlap(b, a)).toBe(true);
    });

    it.each([
        ["C:\\work", "C:\\work2"],
        ["C:\\work", "D:\\work"],
        ["C:\\work\\a", "C:\\work\\b"],
        ["\\\\server\\share\\a", "\\\\server\\other\\a"],
        ["remote-x:a", "remote-y:a"],
        ["remote-x:a", "remote-x:ab"],
        ["C:\\work", "remote-x:work"],
    ])("%s 와 %s 는 겹치지 않는다", (a, b) => {
        expect(pathsOverlap(a, b)).toBe(false);
    });
});

describe("backupRoot / backupDirFor", () => {
    it("로컬 대상은 같은 드라이브 최상위의 .rclonegui-backup", () => {
        expect(backupRoot("D:\\backup\\대상 폴더")).toBe("D:\\.rclonegui-backup");
        expect(backupDirFor("d:/backup/x", "job-a", "20261012-153005")).toBe(
            "d:\\.rclonegui-backup\\job-a\\20261012-153005",
        );
    });

    it("UNC 대상은 같은 공유 최상위", () => {
        expect(backupRoot("\\\\server\\share\\a\\b")).toBe("\\\\server\\share\\.rclonegui-backup");
    });

    it("리모트 대상은 같은 리모트 최상위, 구분자는 /", () => {
        expect(backupDirFor("remote-x:My Projects", "job-a", "20261012-153005")).toBe(
            "remote-x:.rclonegui-backup/job-a/20261012-153005",
        );
    });

    it("드라이브를 알 수 없는 상대 경로는 null", () => {
        expect(backupRoot("relative\\dir")).toBeNull();
        expect(backupDirFor("relative\\dir", "job-a", "r1")).toBeNull();
    });

    it("백업 뿌리는 드라이브 최상위가 아닌 대상과 겹치지 않는다", () => {
        expect(pathsOverlap(backupRoot("D:\\backup")!, "D:\\backup")).toBe(false);
        expect(pathsOverlap(backupRoot("D:\\")!, "D:\\")).toBe(true);
    });
});

describe("destKey", () => {
    it("표기만 다른 같은 대상은 같은 키다", () => {
        expect(destKey("D:\\Backup\\X\\")).toBe(destKey("d:/backup/x"));
        expect(destKey("remote-x:a/b/")).toBe(destKey("remote-x:a/b"));
        expect(destKey("D:\\backup\\x")).not.toBe(destKey("D:\\backup\\y"));
    });
});
