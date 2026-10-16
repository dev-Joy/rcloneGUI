/**
 *  Settings store
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 앱 설정 저장소 (rclonegui.db의 settings 표, 한 행)
 */

/**
 *  Internal imports
 */
import { settingsSchema } from "@/shared/schemas";
import type { typSettings } from "@/shared/types";
import type { clsAppDatabase } from "./app-database";

/**
 *  Types 정의
 */
const DEFAULTS: typSettings = {
    rclonePath: null,
    rcloneConfig: null,
    defaultSource: null,
    defaultDest: null,
    launchAtLogin: false,
};

/**
 *  내부 함수
 */
/** DB 행을 설정으로. 없거나 JSON · 스키마가 맞지 않으면 기본값. */
function f_ParseSettings(data: string | undefined): typSettings {
    if (data === undefined) return DEFAULTS;
    try {
        const parsed = settingsSchema.safeParse(JSON.parse(data));
        return parsed.success ? parsed.data : DEFAULTS;
    } catch {
        return DEFAULTS;
    }
}

/**
 *  메인 클래스 / export 함수
 */
export class clsSettingsStore {
    private settings: typSettings | null = null;

    constructor(private readonly app: clsAppDatabase) {}

    async get(): Promise<typSettings> {
        if (this.settings === null) {
            const row = this.app.db.prepare("SELECT data FROM settings WHERE id = 1").get() as
                | { data: string }
                | undefined;
            this.settings = f_ParseSettings(row?.data);
        }
        return this.settings;
    }

    async save(settings: typSettings): Promise<typSettings> {
        this.app.db
            .prepare(
                "INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data",
            )
            .run(JSON.stringify(settings));
        this.settings = settings;
        return settings;
    }
}
