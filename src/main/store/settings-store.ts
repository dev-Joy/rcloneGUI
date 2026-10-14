/**
 *  Settings store
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 앱 설정 저장소 (settings.json)
 */

/**
 *  External imports
 */
import { join } from "node:path";

/**
 *  Internal imports
 */
import { settingsSchema } from "@/shared/schemas";
import type { typSettings } from "@/shared/types";
import { readJson, writeJson } from "./json-file";

/**
 *  Types 정의
 */
const DEFAULTS: typSettings = { rclonePath: null, rcloneConfig: null };

/**
 *  메인 클래스 / export 함수
 */
export class clsSettingsStore {
    private readonly file: string;
    private settings: typSettings | null = null;

    constructor(baseDir: string) {
        this.file = join(baseDir, "settings.json");
    }

    async get(): Promise<typSettings> {
        if (this.settings === null) {
            const parsed = settingsSchema.safeParse(await readJson(this.file));
            this.settings = parsed.success ? parsed.data : DEFAULTS;
        }
        return this.settings;
    }

    async save(settings: typSettings): Promise<typSettings> {
        await writeJson(this.file, settings);
        this.settings = settings;
        return settings;
    }
}
