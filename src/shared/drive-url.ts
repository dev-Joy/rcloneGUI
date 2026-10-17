/**
 *  Drive url
 *
 *  @author dev-Joy    2026-10-17
 *  @description
 *      - Google Drive 폴더 웹 주소에서 폴더 ID를 꺼내고, 이미 있는 Drive 리모트로 그 폴더를 쓰는 연결 문자열을 만든다
 *      - 연결 문자열 `<리모트>,root_folder_id=<ID>:<하위 경로>` (rclone-notes 2026-10-17). 순수 함수
 */

/**
 *  Types 정의
 */
/** 폴더 주소: …/drive/folders/<ID>, …/drive/u/<N>/folders/<ID>, …/open?id=<ID>, …/folderview?id=<ID> */
const FOLDER_URL =
    /^https?:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,})|(?:open|folderview)\?(?:[^#]*&)?id=([A-Za-z0-9_-]{10,}))(?:[/?#&]|$)/i;

/** 연결 문자열: <리모트>,root_folder_id=<ID>:<하위 경로> */
const DRIVE_LOCATION = /^([^:,\\/]+),root_folder_id=([A-Za-z0-9_-]{10,}):(.*)$/;

export interface itfDriveLocation {
    /** 리모트 이름 (끝의 : 없이) */
    remote: string;
    folderId: string;
    /** 그 폴더 안의 하위 경로. 맨 위면 "" */
    subPath: string;
}

/**
 *  메인 클래스 / export 함수
 */
/** Google Drive 폴더 웹 주소면 폴더 ID, 아니면 null (파일 주소 · 다른 사이트도 null) */
export function parseDriveFolderUrl(text: string): string | null {
    const match = FOLDER_URL.exec(text.trim());
    return match ? (match[1] ?? match[2] ?? null) : null;
}

/** 이미 있는 Drive 리모트로 그 폴더를 쓰는 경로. remote는 "이름:" 또는 "이름" */
export function driveFolderLocation(remote: string, folderId: string): string {
    return `${remote.replace(/:$/, "")},root_folder_id=${folderId}:`;
}

/** 경로가 Drive 폴더 연결 문자열이면 나눠 돌려준다. 아니면 null */
export function parseDriveLocation(path: string): itfDriveLocation | null {
    const match = DRIVE_LOCATION.exec(path.trim());
    return match ? { remote: match[1], folderId: match[2], subPath: match[3] } : null;
}
