# THIRD_PARTY_NOTICES

Baton이 쓰는 외부 오픈소스. 라이브러리나 폰트를 새로 들일 때마다 이 표에 한 줄을 더한다 (AGENTS.md 작업 원칙).
버전과 라이선스는 2026-10-11에 `node_modules/<이름>/package.json`에서 읽은 값이다.
폰트는 따로 넣지 않고 시스템 글꼴만 쓴다.

## 앱에 함께 들어가는 것 (runtime)

| 이름                    | 버전    | 라이선스 | 출처                                 |
| ----------------------- | ------- | -------- | ------------------------------------ |
| @tanstack/react-virtual | 3.14.14 | MIT      | https://github.com/TanStack/virtual  |
| react                   | 19.3.0  | MIT      | https://github.com/react/react       |
| react-dom               | 19.3.0  | MIT      | https://github.com/react/react       |
| zod                     | 4.6.5   | MIT      | https://github.com/colinhacks/zod    |
| zustand                 | 5.0.15  | MIT      | https://github.com/pmndrs/zustand    |
| electron                | 44.7.0  | MIT      | https://github.com/electron/electron |

electron은 devDependency로 설치하지만 앱을 실행하는 런타임이라 이 표에 둔다. Electron에 포함된 Chromium·Node.js 등의
고지는 `node_modules/electron/dist/LICENSES.chromium.html`에 있다.

## 개발 도구 (배포물에 들어가지 않음)

| 이름                 | 버전    | 라이선스   | 출처                                                   |
| -------------------- | ------- | ---------- | ------------------------------------------------------ |
| electron-vite        | 5.0.0   | MIT        | https://github.com/alex8088/electron-vite              |
| vite                 | 7.3.7   | MIT        | https://github.com/vitejs/vite                         |
| @vitejs/plugin-react | 5.2.0   | MIT        | https://github.com/vitejs/vite-plugin-react            |
| typescript           | 6.0.3   | Apache-2.0 | https://github.com/microsoft/TypeScript                |
| vitest               | 5.0.3   | MIT        | https://github.com/vitest-dev/vitest                   |
| oxlint               | 1.87.0  | MIT        | https://github.com/oxc-project/oxc                     |
| oxfmt                | 0.72.0  | MIT        | https://github.com/oxc-project/oxc                     |
| eslint               | 10.12.0 | MIT        | https://github.com/eslint/eslint                       |
| typescript-eslint    | 8.71.1  | MIT        | https://github.com/typescript-eslint/typescript-eslint |
| @types/node          | 24.19.2 | MIT        | https://github.com/DefinitelyTyped/DefinitelyTyped     |
| @types/react         | 19.3.0  | MIT        | https://github.com/DefinitelyTyped/DefinitelyTyped     |
| @types/react-dom     | 19.3.0  | MIT        | https://github.com/DefinitelyTyped/DefinitelyTyped     |

코드 색인 도구 CodeGraph(`@colbymchenry/codegraph`, MIT, https://github.com/colbymchenry/codegraph)도 개발 PC에 전역으로 설치해 쓰며 의존성에 들어가지 않는다.

패키지 매니저 pnpm(MIT, https://github.com/pnpm/pnpm)은 개발 PC에 따로 설치해 쓰며 의존성에 들어가지 않는다.

## 앱이 실행하지만 함께 배포하지 않는 것

| 이름   | 라이선스 | 출처                             |
| ------ | -------- | -------------------------------- |
| rclone | MIT      | https://github.com/rclone/rclone |

rclone은 사용자가 따로 설치한 실행 파일을 호출만 한다.
