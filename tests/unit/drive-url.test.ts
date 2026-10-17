/**
 *  Drive url test
 *
 *  @author dev-Joy    2026-10-17
 *  @description
 *      - Google Drive 폴더 주소에서 ID 꺼내기 · 연결 문자열 만들기 · 나누기, listremotes --long --json 파서
 */

/**
 *  External imports
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { parseRemoteList } from "@/main/rclone/locate";
import { driveFolderLocation, parseDriveFolderUrl, parseDriveLocation } from "@/shared/drive-url";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

describe("parseDriveFolderUrl", () => {
    it.each([
        [`https://drive.google.com/drive/folders/${ID}`],
        [`https://drive.google.com/drive/folders/${ID}?usp=sharing`],
        [`https://drive.google.com/drive/folders/${ID}?usp=drive_link`],
        [`  https://drive.google.com/drive/u/1/folders/${ID}#x  `],
        [`https://drive.google.com/open?id=${ID}`],
        [`https://drive.google.com/folderview?usp=sharing&id=${ID}`],
        [`HTTP://DRIVE.GOOGLE.COM/drive/folders/${ID}/`],
    ])("%s 에서 폴더 ID를 꺼낸다", (url) => {
        expect(parseDriveFolderUrl(url)).toBe(ID);
    });

    it.each([
        [`https://drive.google.com/file/d/${ID}/view`],
        [`https://docs.google.com/document/d/${ID}/edit`],
        [`https://drive.google.com.evil.example/drive/folders/${ID}`],
        [`https://drive.google.com/drive/folders/short`],
        [`https://drive.google.com/open?id=${ID}x$`],
        [`remote-a:folder`],
        ["C:\\work\\folder"],
        [""],
    ])("%s 는 폴더 주소가 아니다", (text) => {
        expect(parseDriveFolderUrl(text)).toBeNull();
    });
});

describe("driveFolderLocation · parseDriveLocation", () => {
    it("리모트 이름(끝의 : 유무와 상관없이)과 ID로 연결 문자열을 만들고, 다시 나눈다", () => {
        expect(driveFolderLocation("remote-a:", ID)).toBe(`remote-a,root_folder_id=${ID}:`);
        expect(driveFolderLocation("remote-a", ID)).toBe(`remote-a,root_folder_id=${ID}:`);
        expect(parseDriveLocation(`remote-a,root_folder_id=${ID}:`)).toEqual({
            remote: "remote-a",
            folderId: ID,
            subPath: "",
        });
        expect(parseDriveLocation(`remote-a,root_folder_id=${ID}:백업/2026`)?.subPath).toBe("백업/2026");
        expect(parseDriveLocation("remote-a:백업")).toBeNull();
        expect(parseDriveLocation(`C:\\x,root_folder_id=${ID}:`)).toBeNull();
    });
});

describe("parseRemoteList (listremotes --long --json)", () => {
    it("실제 출력에서 이름(끝에 :)과 종류를 읽는다", () => {
        const text = readFileSync(join(__dirname, "..", "fixtures", "listremotes-json.json"), "utf8");
        expect(parseRemoteList(text)).toEqual([{ name: "remote-a:", type: "drive" }]);
    });

    it("빈 목록과 형식이 틀린 출력", () => {
        expect(parseRemoteList("[]")).toEqual([]);
        expect(() => parseRemoteList('{"name":"x"}')).toThrow();
    });
});
