/**
 *  Env
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - 화면 전역 타입. preload가 여는 window.baton을 선언한다.
 */

/**
 *  Internal imports
 */
import type { itfBatonApi } from "@/shared/ipc-contract";

/**
 *  Types 정의
 */
declare global {
    // 전역 Window에 합쳐지는 선언이라 이름을 바꿀 수 없다.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    interface Window {
        /** preload가 contextBridge로 열어 준 함수. 화면이 main과 이야기하는 유일한 통로다. */
        baton: itfBatonApi;
    }
}

export {};
