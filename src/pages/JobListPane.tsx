/**
 *  Job list pane
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 왼쪽 작업 목록
 *      - 이름, 모드, 마지막 실행 결과를 보여준다
 *      - 그룹이 있으면 그룹별로 접고 펴며, 그룹 만들기 · 이름 바꾸기 · 지우기를 한다 (F21)
 */

/**
 *  External imports
 */
import { useEffect, useState } from "react";

/**
 *  Internal imports
 */
import ZBCBadge from "@/components/ZBCBadge";
import ZBCButton from "@/components/ZBCButton";
import ZBCDot from "@/components/ZBCDot";
import { describeSchedule, lastRunText, nextRunText } from "@/lib/schedule-text";
import { unwrap, useApp } from "@/stores/app-store";
import type { itfGroup, typJob } from "@/shared/types";
import GroupNameDialog from "./GroupNameDialog";
import styles from "./JobListPane.module.css";

/**
 *  Props & Types 정의
 */
export interface itfJobListPaneProps {
    onNew: () => void;
}

const propsDefault = {} satisfies Partial<itfJobListPaneProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function JobListPane(iProps: itfJobListPaneProps) {
    const { onNew } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    /** 전역 상태 */
    const jobs = useApp((s) => s.jobs);
    const selectedId = useApp((s) => s.selectedId);
    const views = useApp((s) => s.views);
    const select = useApp((s) => s.select);
    const groups = useApp((s) => s.groups);
    const deleteGroup = useApp((s) => s.deleteGroup);

    /** 접힌 그룹 ID (F21). 화면 상태에만 둔다. "" 는 그룹 없음 */
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    /** 이름 대화상자: null 닫힘, "new" 새 그룹, 그 밖에는 이름을 바꿀 그룹 */
    const [naming, setNaming] = useState<itfGroup | "new" | null>(null);
    /** 자동 실행기가 센 다음 실행 시각 (작업 ID → ISO). 30초마다 · 작업이 바뀌면 다시 묻는다 */
    const [nextRuns, setNextRuns] = useState<Record<string, string | null>>({});
    /** 다음 실행 문구의 "오늘" 기준 */
    const [now, setNow] = useState(() => new Date());
    /** 지우기를 한 번 더 묻는 중인 그룹 */
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    //
    // Effect (부수 효과)
    //

    // 다음 실행 시각은 자동 실행기가 앱을 켠 뒤부터 센 값을 쓴다. 30초마다, 작업 목록이 바뀌면 다시 묻는다
    useEffect(() => {
        let alive = true;
        const f_Load = () => {
            unwrap(window.rclonegui.jobs.nextRuns()).then(
                (runs) => {
                    if (!alive) return;
                    setNextRuns(runs);
                    setNow(new Date());
                },
                () => undefined,
            );
        };
        f_Load();
        const timer = window.setInterval(f_Load, 30_000);
        return () => {
            alive = false;
            window.clearInterval(timer);
        };
    }, [jobs]);

    //
    // 내부 변수
    //
    const _V = {
        /** 그룹 없음 아래에 둘 작업. 없는 그룹을 가리키는 작업도 여기에 보여 목록에서 사라지지 않게 한다 */
        ungrouped: jobs.filter((job) => !groups.some((group) => group.id === job.groupId)),
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 작업의 최근 실행 (동기화 · 비교) 또는 진행 상태 */
    function f_SubText(job: typJob) {
        const view = views[job.id];
        if (view?.active) return "실행 중";
        return lastRunText(view?.history ?? []);
    }

    /** 자동 실행 줄: 주기와 다음 실행 시각. 멈춤이면 다음 시각은 쓰지 않는다 */
    function f_ScheduleText(job: typJob) {
        const period = describeSchedule(job.schedule);
        const next = nextRuns[job.id];
        return job.schedule.paused || !next ? period : `${period} · ${nextRunText(new Date(next), now)}`;
    }

    /** 작업의 상태 점 색 */
    function f_DotTone(job: typJob) {
        const view = views[job.id];
        return view?.active ? "running" : (view?.history[0]?.status ?? "none");
    }

    /** 작업을 고른다 */
    function h_Select(jobId: string) {
        void select(jobId);
    }

    /** 그룹을 접거나 편다 */
    function h_Toggle(groupId: string) {
        setCollapsed((current) => {
            const next = new Set(current);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    }

    /** 그룹을 지운다 (한 번 더 확인한 뒤) */
    function h_DeleteGroup(groupId: string) {
        setConfirmDelete(null);
        void deleteGroup(groupId);
    }

    /** 그룹 머리: 접기 · 이름 · 작업 수, 마우스를 올리면 이름 바꾸기 · 지우기 */
    function f_GroupHeader(group: itfGroup | null, count: number) {
        const id = group?.id ?? "";
        const open = !collapsed.has(id);
        if (group && confirmDelete === group.id) {
            return (
                <div className={styles.confirm}>
                    <span>
                        "{group.name}"을(를) 지웁니다. 작업 {count}개는 그룹 없음으로 옮겨집니다.
                    </span>
                    <span className={styles.groupActions}>
                        <ZBCButton small variant="danger" onClick={() => h_DeleteGroup(group.id)}>
                            지우기
                        </ZBCButton>
                        <ZBCButton small onClick={() => setConfirmDelete(null)}>
                            취소
                        </ZBCButton>
                    </span>
                </div>
            );
        }
        return (
            <div className={styles.group}>
                <button
                    type="button"
                    className={styles.groupToggle}
                    aria-expanded={open}
                    onClick={() => h_Toggle(id)}
                >
                    <span className={styles.arrow}>{open ? "▾" : "▸"}</span>
                    <span className={styles.groupName}>{group?.name ?? "그룹 없음"}</span>
                    <span className={styles.groupCount}>({count})</span>
                </button>
                {group && (
                    <span className={styles.groupActions}>
                        <ZBCButton small variant="link" onClick={() => setNaming(group)}>
                            이름 바꾸기
                        </ZBCButton>
                        <ZBCButton small variant="link" onClick={() => setConfirmDelete(group.id)}>
                            지우기
                        </ZBCButton>
                    </span>
                )}
            </div>
        );
    }

    /** 작업 한 줄 */
    function f_JobItem(job: typJob) {
        return (
            <li key={job.id}>
                <button
                    type="button"
                    className={job.id === selectedId ? `${styles.item} ${styles.selected}` : styles.item}
                    onClick={() => h_Select(job.id)}
                    title={[
                        job.name,
                        f_SubText(job),
                        job.schedule.paused
                            ? `자동 멈춤: ${job.schedule.paused.reason}`
                            : job.schedule.enabled
                              ? `자동 ${f_ScheduleText(job)}`
                              : "",
                    ]
                        .filter(Boolean)
                        .join("\n")}
                >
                    <ZBCDot tone={f_DotTone(job)} />
                    <span className={styles.text}>
                        <span className={styles.name}>{job.name}</span>
                        <span className={styles.sub}>
                            <ZBCBadge tone={job.mode === "sync" ? "change" : "add"}>{job.mode}</ZBCBadge>
                            <span className={styles.subText}>{f_SubText(job)}</span>
                        </span>
                        {(job.schedule.enabled || job.schedule.paused) && (
                            <span className={styles.sub}>
                                <span className={job.schedule.paused ? styles.autoPaused : styles.auto}>
                                    {job.schedule.paused ? "자동 멈춤" : "자동"}
                                </span>
                                <span className={styles.subText}>{f_ScheduleText(job)}</span>
                            </span>
                        )}
                    </span>
                </button>
            </li>
        );
    }

    /** 그룹 하나와 그 작업들 (그룹이 있을 때만) */
    function f_Section(group: itfGroup | null, members: typJob[]) {
        const id = group?.id ?? "";
        return (
            <li key={`group:${id}`} className={styles.section}>
                {f_GroupHeader(group, members.length)}
                {!collapsed.has(id) && (
                    <ul className={styles.members}>{members.map((job) => f_JobItem(job))}</ul>
                )}
            </li>
        );
    }

    return (
        <aside className={styles.JobListPane}>
            <div className={styles.title}>{groups.length > 0 ? `모든 작업 (${jobs.length})` : "작업"}</div>
            <ul className={styles.list}>
                {groups.length === 0
                    ? jobs.map((job) => f_JobItem(job))
                    : [
                          ...groups.map((group) =>
                              f_Section(
                                  group,
                                  jobs.filter((job) => job.groupId === group.id),
                              ),
                          ),
                          ...(_V.ungrouped.length > 0 ? [f_Section(null, _V.ungrouped)] : []),
                      ]}
            </ul>
            <div className={styles.addRow}>
                <ZBCButton onClick={onNew}>+ 새 작업</ZBCButton>
                <ZBCButton onClick={() => setNaming("new")}>+ 새 그룹</ZBCButton>
            </div>
            {naming !== null && (
                <GroupNameDialog
                    group={naming === "new" ? undefined : naming}
                    onClose={() => setNaming(null)}
                />
            )}
        </aside>
    );
}
