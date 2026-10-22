/**
 *  Options file test
 *
 *  @author dev-Joy    2026-10-17
 *  @description
 *      - 작업별 rclone 옵션 파일 (F27 · SR-15): 형식, 따옴표, 주석, 한도, 허용 목록, 거부 이유
 */

/**
 *  External imports
 */
import { describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { parseOptionsText } from "@/shared/options-file";

describe("parseOptionsText", () => {
    it("한 줄에 옵션 하나, 값은 띄어 쓰거나 =로, 주석 · 빈 줄 · BOM은 건너뛴다", () => {
        const text = [
            "\uFEFF# 속도",
            "--bwlimit 10M",
            "",
            "  --checksum  ",
            "--drive-chunk-size=64M",
            '--user-agent "my app 1.0"',
            "--max-age 30d",
        ].join("\r\n");
        expect(parseOptionsText(text)).toEqual([
            "--bwlimit",
            "10M",
            "--checksum",
            "--drive-chunk-size=64M",
            "--user-agent",
            "my app 1.0",
            "--max-age",
            "30d",
        ]);
        expect(parseOptionsText("")).toEqual([]);
        expect(parseOptionsText("# 비어 있음\n\n")).toEqual([]);
    });

    it.each([
        ["--max-delete 5", "2번째 줄: --max-delete 옵션은 옵션 파일에서 쓸 수 없습니다 (삭제 한도는"],
        ["--backup-dir D:/x", "--backup-dir 옵션은 옵션 파일에서 쓸 수 없습니다 (백업 폴더는 앱이 정합니다)"],
        ["--dry-run", "--dry-run 옵션은 옵션 파일에서 쓸 수 없습니다"],
        ["--config other.conf", "--config 옵션은"],
        ["--exclude *.tmp", "--exclude 옵션은"],
        ["--filter-from f.txt", "--filter-from 옵션은"],
        ["--delete-before", "지우는 방식을 바꿉니다"],
        ["--delete-excluded", "지우는 방식을 바꿉니다"],
        ["--track-renames", "지우는 방식을 바꿉니다"],
        ["--dump headers", "차단 목록에 있습니다"],
        ["--dump-bodies", "차단 목록에 있습니다"],
        ["--no-check-dest", "차단 목록에 있습니다"],
        ["--transfers 8", "편집 창의 칸으로 정합니다"],
        ["--ignore-errors", "편집 창의 안전 칸으로 정합니다"],
        ["--rc", "허용 목록에 없습니다"],
        ["--links", "허용 목록에 없습니다"],
        ["-c", "--로 시작하는 긴 옵션 이름이 아닙니다"],
        ["bwlimit 10M", "--로 시작하는 긴 옵션 이름이 아닙니다"],
        ["--bwlimit 10M --checksum", "한 줄에 옵션 하나만 씁니다"],
        ['--user-agent "unclosed', "큰따옴표가 닫히지 않았습니다"],
        // 값 없는 옵션 뒤 낱말은 rclone이 다른 옵션으로 읽는다 → 우회 경로라 받지 않는다 (R1 검토)
        ["--checksum --ignore-errors", "--checksum 옵션은 값 없이 씁니다"],
        ["--checksum --config=other.conf", "--checksum 옵션은 값 없이 씁니다"],
        ["--update --log-file=x.log", "--update 옵션은 값 없이 씁니다"],
        ["--checksum yes", "--checksum 옵션은 값 없이 씁니다"],
        ["--bwlimit", "--bwlimit 옵션에 값이 하나 필요합니다"],
        ["--bwlimit --delete-before", "--bwlimit 옵션의 값은 -로 시작할 수 없습니다"],
        ["--max-age=-1s", "--max-age 옵션의 값은 -로 시작할 수 없습니다"],
        ["--drive-chunk-size 64M", "백엔드 설정은 --drive-chunk-size=값 처럼"],
        // 이름만 쓰면 값을 받는 설정일 때 rclone이 다음 인자(--dry-run)를 값으로 가져간다 (R2 검토, 실제로 대상 파일이 지워짐)
        ["--s3-storage-class", "백엔드 설정은 --s3-storage-class=값 처럼"],
        ["--local-no-check-updated", "백엔드 설정은 --local-no-check-updated=값 처럼"],
        ["--drive-chunk-size=", "백엔드 설정은"],
        ["--drive-chunk-size=-1", "백엔드 설정은"],
        ["--drive-use-trash=false", "비밀값 · 삭제 방식 · 위치를 바꾸는 백엔드 설정입니다"],
        ["--b2-hard-delete", "비밀값 · 삭제 방식 · 위치를 바꾸는"],
        ["--onedrive-hard-delete", "비밀값 · 삭제 방식 · 위치를 바꾸는"],
        ["--drive-root-folder-id=abc", "비밀값 · 삭제 방식 · 위치를 바꾸는"],
        ["--sftp-pass=secret", "비밀값 · 삭제 방식 · 위치를 바꾸는"],
        ["--s3-secret-access-key=x", "비밀값 · 삭제 방식 · 위치를 바꾸는"],
        ["--drive-token=x", "비밀값 · 삭제 방식 · 위치를 바꾸는"],
        ["--crypt-remote=x:", "비밀값 · 삭제 방식 · 위치를 바꾸는"],
        // 명령을 실행하는 백엔드 설정 (R3 검토 권고, 승인 뒤 더함)
        ["--sftp-ssh=ssh.exe", "비밀값 · 삭제 방식 · 위치를 바꾸는"],
        ["--sftp-md5sum-command=md5sum", "비밀값 · 삭제 방식 · 위치를 바꾸는"],
        ["--sftp-shell-type=unix", "비밀값 · 삭제 방식 · 위치를 바꾸는"],
    ])("%s 는 거부한다", (line, message) => {
        expect(() => parseOptionsText(`--checksum\n${line}`)).toThrow(message);
    });

    it("값 없는 옵션은 =true|false만, 값 있는 옵션은 띄어 쓰거나 =로, 백엔드는 =로", () => {
        const text = [
            "--checksum=false",
            "--bwlimit=10M",
            "--max-age 30d",
            "--drive-chunk-size=64M",
            "--local-no-check-updated=true",
        ].join("\n");
        expect(parseOptionsText(text)).toEqual([
            "--checksum=false",
            "--bwlimit=10M",
            "--max-age",
            "30d",
            "--drive-chunk-size=64M",
            "--local-no-check-updated=true",
        ]);
    });

    it("200줄 · 한 줄 512자를 넘으면 거부한다", () => {
        expect(parseOptionsText(Array.from({ length: 200 }, () => "--checksum").join("\n"))).toHaveLength(
            200,
        );
        expect(() => parseOptionsText(Array.from({ length: 201 }, () => "--checksum").join("\n"))).toThrow(
            "200줄까지",
        );
        expect(() => parseOptionsText(`--user-agent ${"x".repeat(520)}`)).toThrow("512자를 넘습니다");
    });
});
