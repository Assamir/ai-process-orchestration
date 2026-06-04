# Audit pipeline – workspace

Ten katalog zawiera config i helper scripty dla custom agenta **audit-agents**.

## Quick start

1. Otwórz repo w VS Code z włączonym GitHub Copilotem.
2. Cmd/Ctrl+Shift+P → **Chat: Select Agent** → wybierz `audit-agents`.
3. W chacie wpisz: `scan`
4. Po skanie kliknij **Pogłęb (interaktywne pytania)** lub wpisz `deep`.
5. Na końcu wpisz `report` → powstanie `audit-report-<ts>.md`.
6. Aby wykonać konkretny krok: `apply OPT-001` (lub kilka: `apply OPT-001,OPT-002`).

## Dependencies

**Zero dependencies projektowych.** Helper scripty są self-contained (parser
frontmatter + glob + estymator tokenów są vendored w `scripts/_shared.mjs`).
Wymagają jedynie **Node.js >= 20** zainstalowanego lokalnie.

Token count używa estymatora `chars/4`. Jest to w pełni wystarczające do audytu,
bo heurystyki operują na proporcjach i progach, nie absolutnych liczbach. Dlatego
**nie instaluj nic w repo** (ważne zwłaszcza w projektach nie-JS, np. Java —
żadnego `node_modules/` ani `package.json`).

## Pliki state

- `baseline.json` — snapshot po pierwszym `scan`, referencja dla delta tokenów po `apply`
- `scan-<ts>.json` — surowy wynik skanu (findings, token counts)
- `decisions-<ts>.json` — odpowiedzi usera z trybu `deep`
- `audit-report-<ts>.md` — finalny raport (human + machine readable)
- `audit-input/metrics.json` — OPCJONALNE, export z GitHub Copilot Metrics API

## Wzbogacenie o realne dane wywołań

Skill statycznie analizuje konfigurację. Aby wzbogacić H2/H4 o realne dane:

1. Settings → Copilot → Usage metrics (admin)
2. Eksport JSON za ostatnie 30 dni
3. Zapisz jako `.github/audit/audit-input/metrics.json`
4. Ponów `scan` — H2/H4 dostaną kolumnę „realne wywołania"
