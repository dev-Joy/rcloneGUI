import tseslint from "typescript-eslint";

// 린트는 oxlint(.oxlintrc.json)가 맡는다. ESLint에는 oxlint에 없는 규칙 두 가지만 남긴다.
const noShellTrue = {
    selector: "Property[key.name='shell'][value.value=true]",
    message: "shell: true 금지. rclone은 인자 배열과 shell: false로만 실행한다 (AGENTS.md 1.1).",
};

export default tseslint.config(
    { ignores: ["out/**", "dist/**", "node_modules/**"] },
    {
        files: ["**/*.{ts,tsx,mjs}"],
        languageOptions: { parser: tseslint.parser },
        plugins: { "@typescript-eslint": tseslint.plugin },
        linterOptions: { reportUnusedDisableDirectives: "off" },
        rules: {
            "no-restricted-syntax": ["error", noShellTrue],
            // type은 typ, interface는 itf, class는 cls 접두사를 쓴다 (AGENTS.md 개발 규칙).
            "@typescript-eslint/naming-convention": [
                "error",
                { selector: "typeAlias", format: null, custom: { regex: "^typ[A-Z]", match: true } },
                { selector: "interface", format: null, custom: { regex: "^itf[A-Z]", match: true } },
                { selector: "class", format: null, custom: { regex: "^cls[A-Z]", match: true } },
            ],
        },
    },
);
