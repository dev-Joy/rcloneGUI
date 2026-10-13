// 빌드한 rcloneGUI를 임시 프로필로 띄우고 Chrome DevTools Protocol로 조작한다. 화면까지 포함해 변경을 확인할 때 쓴다.
// 실제 사용자 프로필(%APPDATA%\rcloneGUI)과 실제 작업 폴더는 건드리지 않는다.
//
//   node scripts/dev/drive-app.mjs launch            빌드본(out/)을 임시 프로필 + 디버그 포트로 실행
//   node scripts/dev/drive-app.mjs seed              임시 원본·대상 폴더와 작업 "Dev Fixture"를 만든다
//   node scripts/dev/drive-app.mjs click <글자>      글자가 같은(또는 "<글자>:"로 시작하는) 버튼을 누른다
//   node scripts/dev/drive-app.mjs text <selector>   선택자에 맞는 요소들의 글자를 출력한다
//   node scripts/dev/drive-app.mjs eval <js>         화면에서 식을 평가해 JSON으로 출력한다 (await 가능)
//   node scripts/dev/drive-app.mjs shot <이름>       스크린샷을 <작업 폴더>/shots/<이름>.png 로 저장
//   node scripts/dev/drive-app.mjs stop              띄운 앱을 끈다
//   node scripts/dev/drive-app.mjs clean             앱을 끄고 작업 폴더와 이 도구가 만든 백업 폴더를 지운다
//
// 작업 폴더: RCLONEGUI_DEV_DIR 또는 <임시 폴더>/rclonegui-dev. 포트: RCLONEGUI_DEV_PORT 또는 9333.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const work = process.env.RCLONEGUI_DEV_DIR ?? join(tmpdir(), "rclonegui-dev");
const port = Number(process.env.RCLONEGUI_DEV_PORT ?? 9333);
const pidFile = join(work, "app.pid");
const JOB_ID = "dev-fixture";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function findPage() {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = targets.find((target) => target.type === "page");
    if (!page) throw new Error("앱 창을 찾지 못했습니다");
    return page;
}

/** 화면에 붙어 식을 평가하는 함수와 스크린샷 함수를 돌려준다. */
async function connect() {
    const page = await findPage().catch(() => {
        throw new Error(`포트 ${port}에 앱이 없습니다. 먼저 launch를 실행하세요`);
    });
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((done, fail) => {
        socket.onopen = done;
        socket.onerror = fail;
    });
    let seq = 0;
    const pending = new Map();
    const logs = [];
    socket.onmessage = (message) => {
        const data = JSON.parse(message.data);
        if (data.id && pending.has(data.id)) {
            pending.get(data.id)(data);
            pending.delete(data.id);
        } else if (data.method === "Runtime.exceptionThrown") {
            logs.push(`EXCEPTION: ${JSON.stringify(data.params.exceptionDetails).slice(0, 400)}`);
        } else if (
            data.method === "Runtime.consoleAPICalled" &&
            ["error", "warning"].includes(data.params.type)
        ) {
            logs.push(
                `${data.params.type}: ${data.params.args.map((a) => a.value ?? a.description).join(" ")}`,
            );
        }
    };
    const send = (method, params = {}) =>
        new Promise((done) => {
            seq += 1;
            pending.set(seq, done);
            socket.send(JSON.stringify({ id: seq, method, params }));
        });
    await send("Runtime.enable");
    return {
        logs,
        close: () => socket.close(),
        async evaluate(expression) {
            const reply = await send("Runtime.evaluate", {
                expression,
                awaitPromise: true,
                returnByValue: true,
            });
            if (reply.result.exceptionDetails) {
                throw new Error(
                    JSON.stringify(
                        reply.result.exceptionDetails.exception ?? reply.result.exceptionDetails,
                    ).slice(0, 600),
                );
            }
            return reply.result.result.value;
        },
        async screenshot(file) {
            const reply = await send("Page.captureScreenshot", { format: "png" });
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, Buffer.from(reply.result.data, "base64"));
        },
    };
}

function stop() {
    if (!existsSync(pidFile)) return false;
    const pid = Number(readFileSync(pidFile, "utf8"));
    try {
        process.kill(pid);
    } catch {
        // 이미 꺼져 있다.
    }
    rmSync(pidFile, { force: true });
    return true;
}

async function launch() {
    if (!existsSync(join(root, "out", "main", "index.js")))
        throw new Error("빌드본이 없습니다. 먼저 pnpm run build");
    if (await findPage().catch(() => null))
        throw new Error(`포트 ${port}에 이미 앱이 떠 있습니다. stop 후 다시 실행하세요`);
    mkdirSync(work, { recursive: true });
    const electron = createRequire(join(root, "package.json"))("electron");
    const child = spawn(
        electron,
        [root, `--remote-debugging-port=${port}`, `--user-data-dir=${join(work, "profile")}`],
        {
            detached: true,
            stdio: "ignore",
        },
    );
    child.unref();
    writeFileSync(pidFile, String(child.pid));
    for (let i = 0; i < 50; i += 1) {
        if (await findPage().catch(() => null)) {
            console.log(`실행됨 (pid ${child.pid}, 포트 ${port}, 작업 폴더 ${work})`);
            return;
        }
        await sleep(200);
    }
    throw new Error("앱이 뜨지 않았습니다");
}

/** 추가 1 · 변경 1 · 삭제 1 · 같음 1이 나오는 임시 폴더와 작업을 만든다. */
async function seed() {
    const old = new Date("2026-01-01T00:00:00Z");
    const put = (rel, body, same = false) => {
        const file = join(work, "fixture", rel);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, body);
        if (same) utimesSync(file, old, old);
    };
    rmSync(join(work, "fixture"), { recursive: true, force: true });
    put("src/same.txt", "hello", true);
    put("dst/same.txt", "hello", true);
    put("src/only-src.txt", "new file");
    put("dst/only-dst.txt", "old file");
    put("src/changed.txt", "version 2 longer");
    put("dst/changed.txt", "version 1");
    put("src/node_modules/pkg/index.js", "excluded");

    const job = {
        id: JOB_ID,
        name: "Dev Fixture",
        mode: "sync",
        source: join(work, "fixture", "src"),
        dest: join(work, "fixture", "dst"),
        excludes: ["node_modules/**"],
        options: { checkers: 4, transfers: 4, fastList: false, skipLinks: true },
        safety: { backup: true, autoMaxDelete: 50, allowIgnoreErrors: false },
        schedule: { enabled: false, everyMinutes: 30, chainNext: null },
        rcloneConfig: null,
    };
    const app = await connect();
    const saved = await app.evaluate(`window.rclonegui.jobs.save(${JSON.stringify(job)})`);
    if (!saved.ok) throw new Error(saved.error.message);
    await app.evaluate("location.reload()");
    app.close();
    console.log(`작업 "${job.name}" 준비됨: ${job.source} → ${job.dest}`);
}

const [command, ...rest] = process.argv.slice(2);
const argument = rest.join(" ");

if (command === "launch") await launch();
else if (command === "stop") console.log(stop() ? "앱을 껐습니다" : "띄운 앱이 없습니다");
else if (command === "clean") {
    stop();
    await sleep(500);
    rmSync(work, { recursive: true, force: true });
    // sync를 실제로 돌렸다면 백업이 대상 드라이브 최상위에 생긴다. 이 도구의 작업 것만 지운다.
    rmSync(join(parse(work).root, ".rclonegui-backup", JOB_ID), { recursive: true, force: true });
    console.log(`지움: ${work}`);
} else if (command === "seed") await seed();
else if (["click", "text", "eval", "shot"].includes(command)) {
    const app = await connect();
    if (command === "click") {
        const clicked = await app.evaluate(
            `(() => { const t = ${JSON.stringify(argument)}; const b = [...document.querySelectorAll("button")].find((e) => !e.disabled && (e.textContent.trim() === t || e.textContent.trim().startsWith(t + ":"))); if (!b) return false; b.click(); return true; })()`,
        );
        console.log(clicked ? `눌렀습니다: ${argument}` : `누를 수 있는 버튼이 없습니다: ${argument}`);
        if (!clicked) process.exitCode = 1;
    } else if (command === "text") {
        console.log(
            await app.evaluate(
                `[...document.querySelectorAll(${JSON.stringify(argument)})].map((e) => e.textContent.trim()).join("\\n")`,
            ),
        );
    } else if (command === "eval") {
        console.log(JSON.stringify(await app.evaluate(argument), null, 2));
    } else {
        const file = join(work, "shots", `${argument || "shot"}.png`);
        await app.screenshot(file);
        console.log(file);
    }
    await sleep(100);
    if (app.logs.length > 0) console.log(`--- 화면 콘솔 ---\n${app.logs.join("\n")}`);
    app.close();
} else {
    console.log(
        "사용법: node scripts/dev/drive-app.mjs <launch|seed|click|text|eval|shot|stop|clean> [인자]",
    );
    process.exitCode = 1;
}
