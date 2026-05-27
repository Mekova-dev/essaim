# Changelog

## [0.6.0](https://github.com/swoofer/essaim/compare/v0.5.0...v0.6.0) (2026-05-27)


### Features

* **behaviors:** add user-brief — free-form per-run context injection ([#13](https://github.com/swoofer/essaim/issues/13)) ([294b941](https://github.com/swoofer/essaim/commit/294b941d3c19a20abd43b405f884fd8c5ae0002e))
* **behaviors:** split read-only-mode + add audit-output ([#15](https://github.com/swoofer/essaim/issues/15)) ([8ef65a6](https://github.com/swoofer/essaim/commit/8ef65a6916aa6dbbd3612bd1843eb8d343cfc868))
* **cli:** entry point + version helper (delete paths-stub) ([0684710](https://github.com/swoofer/essaim/commit/0684710433ec40cc9e95f459720210084190af6e))
* **hooks:** PreToolUse start + PostToolUse content + working-files stop for v0.6 coordinator ([cc10862](https://github.com/swoofer/essaim/commit/cc108627752aa3e33ab7a428523fdeea93bbe2a9))
* **hooks:** wire v0.6 coordinator endpoints (PreToolUse + content + working-files) ([fc13009](https://github.com/swoofer/essaim/commit/fc130091f27dc2e09c8ad62c54eaaa0ad6f8c608))
* import agent-loop source from monorepo (with temp paths-stub for build) ([ac6b4a4](https://github.com/swoofer/essaim/commit/ac6b4a42eeab3eaf1c21689be408f8af1947c50d))
* import bridge.ts from monorepo bce/engine/ ([94ebcfc](https://github.com/swoofer/essaim/commit/94ebcfc1e9eb8ca00a5d0aa4b093ad83a78787f6))
* import catalog from monorepo (32 behaviors, 21 presets, 3 compositions, 6 hook scripts) ([11adb5e](https://github.com/swoofer/essaim/commit/11adb5e8b51c5ab08b5075f863e0ef623ec2f6d3))
* import CLI commands + utils from monorepo (rewrite imports + self-update string rewrites) ([7956906](https://github.com/swoofer/essaim/commit/7956906317ce4c4c88a39524dddb0491d91dc492))
* import orchestrator source from monorepo (with temp paths-stub + bce import shims) ([fddc256](https://github.com/swoofer/essaim/commit/fddc256405fab50242d87c422cf6ba6f2cb8bebd))
* in-process coordinator launch (Strategy A) with --coordinator-url override ([3f69f1f](https://github.com/swoofer/essaim/commit/3f69f1f134e12c4b502c7fdb082b3d1d57a0789f))
* **index:** re-export public surface for programmatic consumers ([046f6dc](https://github.com/swoofer/essaim/commit/046f6dc60c5878ed109a3cf2dcb2cc5f4fc73408))
* **presets:** add `phare` template — 4 specialists + 1 reconciliator for multi-angle audits ([0c24db1](https://github.com/swoofer/essaim/commit/0c24db1319570e3329ed81e43c2a7790218317a8))


### Bug Fixes

* bump ip-address override to ^10.2.0 to satisfy socks too ([2a57820](https://github.com/swoofer/essaim/commit/2a57820d7dafb84f0f89be16d5753c492bb07294))
* **cli:** emit deprecation warning when --url is used ([08a03d0](https://github.com/swoofer/essaim/commit/08a03d06c15ca306237d92d6cb45f694c4b46927))
* encoding mojibake throughout source + portable path test ([687c916](https://github.com/swoofer/essaim/commit/687c9162263ccc760f315fb67a9c012b721fe209))
* **hooks:** normalize file_path to repo-relative before POST ([40db10c](https://github.com/swoofer/essaim/commit/40db10cce33b44609a00907c29cec676a8ab3671))
* **hooks:** normalize file_path to repo-relative before POST to coordinator ([494b023](https://github.com/swoofer/essaim/commit/494b023dd13f5e164915361c77162fb5b9121fea))
* **landing:** unescaped closing quote in i18n string broke JS parsing ([4bb7bca](https://github.com/swoofer/essaim/commit/4bb7bcaa4aca7ac828fa1469cfa702b29e535672))
* **orchestrator:** wrap fileURLToPath in try/catch for Bun --compile resilience ([9a449ce](https://github.com/swoofer/essaim/commit/9a449ce93b4e75ef7074e52f73040ab106177e1b))
* override ip-address to 10.1.1 to resolve transitive vulnerability ([a591f4e](https://github.com/swoofer/essaim/commit/a591f4e3b84c986b75baaec4e781de23cd5eb8c9))
* **readme:** drop fake `essaim bce` subcommands that don't exist in the CLI ([#12](https://github.com/swoofer/essaim/issues/12)) ([46baae7](https://github.com/swoofer/essaim/commit/46baae7cd4a40c7d24e01102cfafeab7dcc8490f))
* **test:** bce-coverage.test phantom 'sequential-pipeline' behavior reference ([fc37ecf](https://github.com/swoofer/essaim/commit/fc37ecfc5c526b02913e39980643a631258f648f))


### Documentation

* add Buy Me A Coffee + GitHub Sponsors links across surfaces ([c47b4d7](https://github.com/swoofer/essaim/commit/c47b4d75423b6a13bf76425f6a16f559aa266d93))
* add Contributor License Grant (relicense optionality) ([a41bcbb](https://github.com/swoofer/essaim/commit/a41bcbbbe9fb4deb149c2be2a5dd3aae144fa948))
* **contributing:** add Contributor License Grant for relicense optionality ([48590da](https://github.com/swoofer/essaim/commit/48590dad415effd10e71ad5aac559f7ff14a605f))
* full v0.1.0 README adapted from source mcp-coordinator README + bce/README ([d2810de](https://github.com/swoofer/essaim/commit/d2810de1b5e8f7ab304260cd413c647c10a52199))
* **landing:** adapt source mcp-coordinator landing for orchestrator scope (i18n 6 langs) ([abcf382](https://github.com/swoofer/essaim/commit/abcf382c19259066c6b723577b41836aef831af0))
* **readme:** trim mcp-coordinator overlap (-48% length) ([#11](https://github.com/swoofer/essaim/issues/11)) ([73cb82e](https://github.com/swoofer/essaim/commit/73cb82e8b6aca98547bcf13c3c71619c32d0091e))
* **seo:** add Open Graph + Twitter Cards + sitemap + robots.txt ([8ddf34c](https://github.com/swoofer/essaim/commit/8ddf34c01754803367f084aad8288ee4ca69d48f))


### Code Refactoring

* replace paths-stub.ts with cli/bce-resolver.ts (walk-up + Bun --compile resilient) ([feba62e](https://github.com/swoofer/essaim/commit/feba62ed903cf951efd0206f89bdc02b86e1597a))
* replace server/src/* type imports with mcp-coordinator/types ([2d5acde](https://github.com/swoofer/essaim/commit/2d5acde8c2f816d551dc3879448c5b0f90325a7e))
* thread promptweave imports through public API (fix bce-* test imports) ([e7a083c](https://github.com/swoofer/essaim/commit/e7a083c2b7260da583b155d1fef6f206cfc2d644))

## [0.5.0](https://github.com/swoofer/essaim/compare/v0.4.0...v0.5.0) (2026-05-26)


### Features

* **presets:** add `phare` template — 4 specialists + 1 reconciliator for multi-angle audits
* **behaviors:** add `audit-specialist` and `audit-reconciliator` building blocks for any multi-angle audit

## [0.4.0](https://github.com/swoofer/essaim/compare/v0.3.0...v0.4.0) (2026-05-26)


### Features

* **behaviors:** split read-only-mode + add audit-output ([#15](https://github.com/swoofer/essaim/issues/15)) ([8ef65a6](https://github.com/swoofer/essaim/commit/8ef65a6916aa6dbbd3612bd1843eb8d343cfc868))

## [0.3.0](https://github.com/swoofer/essaim/compare/v0.2.0...v0.3.0) (2026-05-24)


### Features

* **behaviors:** add user-brief — free-form per-run context injection ([#13](https://github.com/swoofer/essaim/issues/13)) ([294b941](https://github.com/swoofer/essaim/commit/294b941d3c19a20abd43b405f884fd8c5ae0002e))


### Bug Fixes

* **hooks:** normalize file_path to repo-relative before POST ([40db10c](https://github.com/swoofer/essaim/commit/40db10cce33b44609a00907c29cec676a8ab3671))
* **hooks:** normalize file_path to repo-relative before POST to coordinator ([494b023](https://github.com/swoofer/essaim/commit/494b023dd13f5e164915361c77162fb5b9121fea))
* **readme:** drop fake `essaim bce` subcommands that don't exist in the CLI ([#12](https://github.com/swoofer/essaim/issues/12)) ([46baae7](https://github.com/swoofer/essaim/commit/46baae7cd4a40c7d24e01102cfafeab7dcc8490f))


### Documentation

* add Contributor License Grant (relicense optionality) ([a41bcbb](https://github.com/swoofer/essaim/commit/a41bcbbbe9fb4deb149c2be2a5dd3aae144fa948))
* **contributing:** add Contributor License Grant for relicense optionality ([48590da](https://github.com/swoofer/essaim/commit/48590dad415effd10e71ad5aac559f7ff14a605f))
* **readme:** trim mcp-coordinator overlap (-48% length) ([#11](https://github.com/swoofer/essaim/issues/11)) ([73cb82e](https://github.com/swoofer/essaim/commit/73cb82e8b6aca98547bcf13c3c71619c32d0091e))

## [0.2.0](https://github.com/swoofer/essaim/compare/v0.1.1...v0.2.0) (2026-05-10)


### Features

* **hooks:** PreToolUse start + PostToolUse content + working-files stop for v0.6 coordinator ([cc10862](https://github.com/swoofer/essaim/commit/cc108627752aa3e33ab7a428523fdeea93bbe2a9))
* **hooks:** wire v0.6 coordinator endpoints (PreToolUse + content + working-files) ([fc13009](https://github.com/swoofer/essaim/commit/fc130091f27dc2e09c8ad62c54eaaa0ad6f8c608))

## [0.1.1](https://github.com/swoofer/essaim/compare/v0.1.0...v0.1.1) (2026-05-06)


### Bug Fixes

* bump ip-address override to ^10.2.0 to satisfy socks too ([2a57820](https://github.com/swoofer/essaim/commit/2a57820d7dafb84f0f89be16d5753c492bb07294))
* encoding mojibake throughout source + portable path test ([687c916](https://github.com/swoofer/essaim/commit/687c9162263ccc760f315fb67a9c012b721fe209))
* **landing:** unescaped closing quote in i18n string broke JS parsing ([4bb7bca](https://github.com/swoofer/essaim/commit/4bb7bcaa4aca7ac828fa1469cfa702b29e535672))
* override ip-address to 10.1.1 to resolve transitive vulnerability ([a591f4e](https://github.com/swoofer/essaim/commit/a591f4e3b84c986b75baaec4e781de23cd5eb8c9))
