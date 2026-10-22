/**
 *  Limits
 *
 *  @author dev-Joy    2026-10-14
 *  @description
 *      - 입력값 최대 글자 수. main의 zod 스키마와 화면 입력창(maxLength)이 같은 값을 쓴다 (F28)
 */

/**
 *  메인 클래스 / export 함수
 */
export const INPUT_LIMITS = {
    /** 작업 이름 */
    jobName: 100,
    /** 원본 · 대상 · rclone.exe · rclone.conf 경로 */
    path: 1024,
    /** 제외 패턴 한 줄 */
    excludePattern: 512,
    /** 제외 패턴 줄 수 */
    excludeCount: 200,
    /** 그룹 이름 (F21) */
    groupName: 50,
    /** 이번 실행에서 뺀 항목 수 (F23) */
    skipCount: 200,
    /** 옵션 파일 줄 수 · 한 줄 글자 수 (F27) */
    optionCount: 200,
    optionLine: 512,
} as const;

/** 제외 패턴 줄들에서 첫 번째 문제를 안내 문구로 돌려준다. 문제가 없으면 null. */
export function findExcludeProblem(lines: readonly string[]): string | null {
    if (lines.length > INPUT_LIMITS.excludeCount) {
        return `제외 패턴은 ${INPUT_LIMITS.excludeCount}줄까지 쓸 수 있습니다`;
    }
    const index = lines.findIndex((line) => line.length > INPUT_LIMITS.excludePattern);
    if (index !== -1) return `${index + 1}번째 줄이 ${INPUT_LIMITS.excludePattern}자를 넘습니다`;
    return null;
}
