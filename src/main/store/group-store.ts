/**
 *  Group store
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - 작업 그룹 저장소 (rclonegui.db의 groups 표, F21)
 *      - 그룹은 목록을 묶어 보는 용도다. 지우면 그 그룹의 작업은 "그룹 없음"으로 옮긴다
 */

/**
 *  Internal imports
 */
import type { itfGroup } from "@/shared/types";
import type { clsAppDatabase } from "./app-database";
import { clsJobError, type clsJobStore } from "./job-store";

/**
 *  메인 클래스 / export 함수
 */
export class clsGroupStore {
    constructor(
        private readonly app: clsAppDatabase,
        private readonly jobs: clsJobStore,
    ) {}

    /** 그룹 목록 (만든 순서) */
    async list(): Promise<itfGroup[]> {
        return this.app.db
            .prepare("SELECT id, name FROM groups ORDER BY position, id")
            .all() as unknown as itfGroup[];
    }

    /** 새로 만들거나(id 없음) 이름을 바꾼다. 같은 이름(대소문자 무시)은 거부한다 */
    async save(input: { id?: string; name: string }, now = new Date()): Promise<itfGroup> {
        const name = input.name.trim();
        const groups = await this.list();
        if (groups.some((g) => g.id !== input.id && g.name.toLowerCase() === name.toLowerCase())) {
            throw new clsJobError("GROUP_DUPLICATE", `같은 이름의 그룹이 이미 있습니다: ${name}`);
        }
        if (input.id) {
            if (!groups.some((g) => g.id === input.id))
                throw new clsJobError("GROUP_NOT_FOUND", "그룹을 찾을 수 없습니다");
            this.app.db.prepare("UPDATE groups SET name = ? WHERE id = ?").run(name, input.id);
            return { id: input.id, name };
        }
        const taken = new Set(groups.map((g) => g.id));
        const base = `g-${now.getTime().toString(36)}`;
        let id = base;
        for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
        this.app.db
            .prepare(
                "INSERT INTO groups (id, name, position) VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM groups))",
            )
            .run(id, name);
        return { id, name };
    }

    /** 그룹을 지우고, 그 그룹의 작업은 "그룹 없음"으로 옮긴다 (한 트랜잭션). 작업은 지우지 않는다 */
    async delete(groupId: string): Promise<void> {
        const moved = await this.jobs.prepareClearGroup(groupId);
        this.app.transaction(() => {
            this.app.db.prepare("DELETE FROM groups WHERE id = ?").run(groupId);
            moved.apply();
        });
        moved.commit();
    }
}
