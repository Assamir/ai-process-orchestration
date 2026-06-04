# Instalacja audit-skill (wersja zero-setup)

Ten skill audytuje **wyłącznie konfigurację GitHub Copilota** w repo
(`.github/agents/`, `.github/instructions/`, `.github/prompts/`,
`.github/copilot-instructions.md`, `.vscode/mcp.json`). Nie analizuje kodu
projektu — działa identycznie w repo Java, Python, JS, dowolnym.

**Nie wymaga `npm install`.** Helper scripty używają wbudowanego estymatora
tokenów (`chars/4`), więc nie zaśmiecają projektu Java plikami
`node_modules/`, `package.json` ani `package-lock.json`.

## Wymaganie jedyne: Node.js

Skrypty pomocnicze uruchamiają się przez Node (jak `git` czy `python` — to
narzędzie lokalne, nie zależność projektu). Sprawdź:

```bash
node --version      # wymagane >= 20
```

Jeśli brak Node: `brew install node` (macOS) / `winget install OpenJS.NodeJS`
(Windows) / [nvm](https://github.com/nvm-sh/nvm) (Linux/macOS).

## Kroki

1. **Rozpakuj** zip w katalogu głównym repo (tam gdzie jest `.git/`):
   ```bash
   unzip audit-skill.zip -d <ścieżka-do-repo>
   ```
   Powstanie:
   ```
   .github/
   ├── agents/audit-agents.agent.md
   └── audit/
       ├── audit-config.yml
       ├── README.md
       └── scripts/*.mjs
   ```
   Jeśli masz już `.github/`, pliki zostaną dołożone — nie nadpisują Twoich
   istniejących agentów ani instrukcji. Po rozpakowaniu możesz usunąć ten
   `INSTALL.md` z roota repo (skill go nie potrzebuje).

2. **Otwórz repo w VS Code** z włączonym GitHub Copilotem.

3. Cmd/Ctrl+Shift+P → **Chat: Select Agent** → wybierz `audit-agents`.

4. W chacie uruchamiaj tryby po kolei:
   - `scan` — inwentaryzacja + heurystyki (read-only)
   - `deep` — interaktywne pytania dla najważniejszych findings
   - `report` — wygenerowanie raportu `audit-report-<ts>.md`
   - `apply OPT-001` — wykonanie konkretnego kroku (z dry-run + potwierdzeniem)

## Dokładność token count

Bez `tiktoken` używany jest fallback `chars/4`. Różnica względem dokładnego
tokenizera to zwykle ~5–10%, a audyt operuje na **proporcjach i progach**
(które pliki są największe, gdzie jest duplikacja, ile tools jest nieużywanych),
więc wnioski są takie same. Estymator jest w pełni wystarczający do tego celu.

Gdybyś kiedyś chciał dokładniejszy count bez śmiecenia w repo Java —
zainstaluj `tiktoken` globalnie poza projektem i wskaż `NODE_PATH`. Ale dla
typowego audytu to zbędne.
