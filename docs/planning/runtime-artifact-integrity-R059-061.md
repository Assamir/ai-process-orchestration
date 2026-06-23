# Plan: Runtime-artifact integrity epic (R-059 → R-061)

> **CHECKPOINT (2026-06-23) — sesja planistyczna wstrzymana, wznowić w nowej sesji.**
> Status: plan kompletny, wszystkie rozwidlenia rozstrzygnięte. **Nie rozpoczęto
> implementacji.** Wznowienie: otwórz ten plik, wejdź w plan mode, zacznij od R-059.
>
> **Decyzje zablokowane przez użytkownika:**
> - Cele: egzekwowanie (walidator) + spójność kształtu + trwałość analiz. Rubryka jakości — pominięta.
> - Analizy persystują jako pliki (wszystkie 5: rca/coverage/review/ticket-review/metrics).
> - Walidator: rozszerza `doctor` + `status:` frontmatter (in-progress=warn, ready/done=error).
> - Allowlista analiz: flip read-only→write (precedens `qa-reverse-engineer`); `qa-gardening` zostaje read-only.
> - Rejestr R-059: zakres tylko `changes/<id>/*`.
> - Cykl życia statusu: **qa-review: in-progress→ready; qa-archive: →done** (zgodnie z backbone).
> - Wersjonowanie: **3 osobne minory** 0.39.0 / 0.40.0 / 0.41.0 (jeden R-### na shippable).
> - Następne ID roadmapy są wolne (ostatni shipped R-058); R-059/060/061 nie kolidują.

## Context

Cel sesji (przeformułowany przez użytkownika): **stała i wysoka jakość artefaktów
dostarczanych przez orkiestrację QA**, wspierających cały proces testowy.

Przegląd kodu (3 sondy nad `packages/core/src/model/{skills,context}.ts`,
`scaffold/index.ts`, `doctor/index.ts`, testy) ujawnił, że produkt dzieli się na dwie
warstwy spójności:

1. **Szkielet** (`context/foundation`, `reference`, guideline'y, root config) — kształt
   *seeded* w `FOUNDATION`/`GUIDELINES`, a jakość **egzekwowana deterministycznie** przez
   `doctor` (struktura, linki, placeholdery, kontrakty guideline'ów, żelazna reguła jako
   *tekst* w root configu). Wpięte w CI jako brama (R-051).
2. **Artefakty runtime** (`context/changes/<id>/{work,plan,cases,automation,performance,
   bug-report}.md` + analizy) — kształt to **proza w ciałach skilli**, a jakość pilnuje
   **wyłącznie ta proza + doradczy `qa-gardening`** (LLM, nie-deterministyczny, nigdy nie
   blokuje).

Trzy luki, które ta zmiana zamyka (wybrane przez użytkownika; rubryka jakości świadomie
pominięta):

- **Brak jednego źródła kształtu artefaktów runtime** — szablony nie są wyniesione do
  rejestru (jak `GUIDELINES`/`FOUNDATION`), więc każdy walidator dublowałby definicję.
- **Najcenniejsze analizy znikają w czacie** — `qa-rca`, `qa-coverage-gap`, `qa-review`,
  `qa-ticket-review`, `qa-metrics` są read-only i **nic nie zapisują**. Brak audytowalnego
  śladu (RCA, coverage, go/no-go).
- **Żelazna reguła QA nie jest egzekwowana na wytworach** — sprawdzana tylko jako *tekst w
  root configu*, nigdy jako własność realnego `cases.md`/testów (AC↔case↔test trace).

**Zakres egzekwowania (uczciwa kalibracja):** walidator deterministyczny gwarantuje
**spójny kształt + kompletność trace'ów**, *nie* semantyczną poprawność treści. Ocena
merytoryczna pozostaje przy `qa-gardening` (doradczo). To jest świadomy, nie-cel.

Wszystko jest po **angielsku** (kod, identyfikatory, PRD/TECH/ROADMAP) — zgodnie z
konwencją `packages/`. Łańcuch ma twardą kolejność zależności: **R-059 → R-060, R-059 →
R-061** (rejestr jest fundamentem walidatora i persystencji).

---

## R-059 — Artifact template registry (single source of shape) — `v0.39.0`

**Cel:** wynieść kształt artefaktów `context/changes/<id>/*` do jednego rejestru,
analogicznie do `GUIDELINES`/`FOUNDATION`, z **parsowalnymi markerami trace** — fundament
pod R-060 i R-061. Zakres: tylko `changes/<id>/*` (foundation/reference mają już seeded
template i są sprawdzane przez doctora).

**Nowy plik:** `packages/core/src/model/artifacts.ts`

```ts
export interface ArtifactTemplate {
  name: string;            // np. "cases"
  pathTemplate: string;    // "context/changes/<work-id>/cases.md"
  producedBy: string;      // nazwa skilla (musi istnieć w SKILLS)
  requiredSections: string[]; // nagłówki, których wymaga walidator
  traceField?: string;     // np. "Traces to" (dla cases.md → AC)
  template: string;        // kanoniczny, seeded body
}
export const ARTIFACTS: ArtifactTemplate[] = [ /* work, plan, cases, automation,
   performance, bug-report — wyjęte z dzisiejszych ciał skilli */ ];
```

**Markery trace (parsowalne, stabilne):**
- `work.md` — każde acceptance criterion jako stabilny id: `- **AC1**: …` (regex `AC\d+`).
  **Plus** frontmatter `status:` (patrz R-061) — `in-progress` na starcie.
- `cases.md` — każdy case ma pole `Traces to: AC1[, AC2]` (dziś prozą „criterion traced
  to"; sformalizować).
- `automation.md` — każdy test referuje case: `Covers: TC1`.

**Zmiany w `model/skills.ts`:** ciała skilli, które dziś opisują szablon prozą, **składają
go z rejestru** (interpolacja stringa: `body: \`…procedura… ${tpl("cases")} …\``), więc
tekst body pozostaje *identyczny dla obu adapterów* (test parzystości nie pęka) i kształt
jest jednoźródłowy. Dotyczy: `qa-new`, `qa-plan`, `qa-test-case-design`, `qa-test-automate`,
`qa-performance`, `qa-bug-report`.

**Reużycie istniejącego:** `LogicalSkill.writes: string[]` (już maszynowo-czytelne ścieżki
artefaktów z tokenem `<work-id>`) — `ArtifactTemplate.pathTemplate` musi się z nimi zgadzać;
dodać asercję spójności `ARTIFACTS ↔ SKILLS.writes` w teście.

**Testy:** nowy `tests/artifacts.test.ts` — snapshot rejestru + asercja, że każdy
`producedBy` istnieje w `SKILLS`, każdy `pathTemplate` występuje w `writes` odpowiedniego
skilla, a każdy szablon zawiera swoje `requiredSections`. Sprawdzić, że `skill-flows.ts`
generator (parsuje body) dalej działa i `docs/skill-catalog.md` snapshot się zgadza
(`WRITE_DOCS=1` regen).

**Krytyczne pliki:** `model/artifacts.ts` (new), `model/skills.ts`, `tests/artifacts.test.ts`
(new), `tests/scaffold.test.ts` (asercja spójności), ROADMAP/PRD §5/§8/TECH §11–§12.

---

## R-060 — Persist analysis artifacts — `v0.40.0` (zależy od R-059)

**Cel:** read-only „sędziowie" zapisują wersjonowany artefakt zamiast tylko czatu —
audytowalność procesu. Wybór użytkownika: **flip na write** (precedens: `qa-reverse-engineer`
czyta kod, jest `write` bo pisze dok).

**Flip `readOnly: true → false`** dla: `qa-rca`, `qa-coverage-gap`, `qa-review`,
`qa-ticket-review`, `qa-metrics`. **`qa-gardening` zostaje read-only** (meta-sweep nad
`context/`, nie producent artefaktu).

**Nowe artefakty (kształt z rejestru R-059):**
- work-item-scoped → `context/changes/<id>/`: `rca.md`, `coverage.md`, `review.md`,
  `ticket-review.md`.
- cross-cutting → **nowy** `context/reports/`: `metrics-<YYYY-MM-DD>.md` (qa-metrics jest
  ponad-work-itemowy). Dodać `context/reports/.gitkeep` do scaffoldu + legendy „Where things
  live" w root configu.

**Konsekwencje do obsłużenia:**
- Allowlista: Claude `+Write,Edit,Bash`; Copilot `+editFiles,runCommands` — renderowane
  automatycznie z `readOnly`. **Test parzystości** asercjonuje allowlisty → zaktualizować.
- Root config buckets oznaczają read-only `*(read-only)*` — te skille znikną z oznaczenia;
  zaktualizować oczekiwania w teście.
- `model/skills.ts`: dodać ścieżki do `writes`, dopisać krok „write the report to
  `<path>`" w procedurze + `## Next`; uzupełnić `ARTIFACTS` (R-059) o `rca/coverage/review/
  ticket-review/metrics`.
- `qa-gardening`/`qa-archive` mogą teraz czytać te raporty (spójność z dotychczasowym
  przepływem).

**Krytyczne pliki:** `model/skills.ts`, `model/artifacts.ts`, `model/context.ts` (root
config legenda + `context/reports/`), `scaffold/index.ts` (.gitkeep), `tests/scaffold.test.ts`
(allowlisty + bucket read-only), `tests/artifacts.test.ts`, ROADMAP/PRD §5/TECH §5.

---

## R-061 — Artifact validator in `doctor` (+ status gating) — `v0.41.0` (zależy od R-059)

**Cel:** uczynić żelazną regułę QA *checkiem na realnych plikach*, nie tylko tekstem.
Wybór użytkownika: **rozszerzyć `doctor`** (już brama CI z R-051) + **`status:` we
frontmatterze** by nie blokować pracy w toku.

**Nowa funkcja:** `validateWorkItems(root, adapter)` w `doctor/index.ts`, wpięta w
`runDoctor` (więc brama CI z R-051 łapie ją automatycznie). Bezpieczna domyślnie: brak
`context/changes/*` → brak findingów (świeży scaffold ma tylko `.gitkeep`).

**Bramkowanie wg statusu** (z `work.md` frontmatter `status:`):
- `in-progress` → **warn** lub pominięcie (praca w toku jest z definicji niekompletna).
- `ready` / `done` → **error** na brakach (pełna brama).
- `context/archive/<id>/` → historia read-only → najwyżej **warn**, nigdy nie blokuje.

**Cykl życia `status:`** (zablokowane): `qa-new` tworzy `in-progress`; **`qa-review`
przestawia `in-progress → ready`** (zgłasza do twardej bramy); **`qa-archive` → `done`** przy
przeniesieniu do `archive/`. Brama doctora egzekwuje twardo dopiero od `ready`. To wymaga
dopisania kroku „set status:" w procedurach `qa-review`/`qa-archive` (R-060/R-061 dotykają
tych skilli, więc spójne).

**Checki (stabilne, deterministyczne id):**
- `WORKITEM:<id>:missing:<artifact>` — oczekiwany artefakt (z `SKILLS.writes` /
  `ARTIFACTS`) nie istnieje dla itemu `ready`/`done`. *(error)*
- `WORKITEM:<id>:section:<artifact>:<header>` — brak wymaganej sekcji
  (`ArtifactTemplate.requiredSections`). *(error)*
- `WORKITEM:<id>:uncovered:<AC>` — AC z `work.md` nie ma żadnego case z `Traces to: <AC>`
  (żelazna reguła!). *(error)*
- `WORKITEM:<id>:untraced-case:<TC>` — case bez `Traces to`. *(warn)*
- `WORKITEM:<id>:orphan-case:<TC>` — case nie pokryty żadnym `Covers:` w automation.
  *(warn)*
- `WORKITEM:<id>:status` — brak/niepoprawny `status:`. *(warn)*

**Parsowanie trace** wykorzystuje markery z R-059 (regexy `AC\d+`, `Traces to:`,
`Covers:`) — *dlatego R-059 jest prerekwizytem*.

**Testy:** rozszerzyć `tests/doctor.test.ts` o fixture'y work-itemów: (a) `in-progress` z
brakami → brak errorów; (b) `ready` z niepokrytym AC → error `WORKITEM:*:uncovered`;
(c) `ready` kompletny → czysto; (d) archive niekompletny → tylko warn. Asercja, że pusty
`changes/` nie generuje findingów.

**Krytyczne pliki:** `doctor/index.ts` (`validateWorkItems`), `model/artifacts.ts` (import
`requiredSections`/`traceField`), `tests/doctor.test.ts`, `cli.ts` (jeśli trzeba flagi
zakresu), ROADMAP/PRD §8/TECH §11.

---

## Weryfikacja (end-to-end)

```powershell
npm install
npm run typecheck
npm test            # core: artifacts (new) + scaffold/parity + doctor + skill-flows
npm run build
npm run docs        # regen docs/skill-catalog.md jeśli body skilli się zmieniły

# Ręczny smoke na świeżym targecie:
node packages/claude-qa-orchestrator/dist/index.js init --root <tmp> --yes
node packages/claude-qa-orchestrator/dist/index.js doctor --root <tmp>   # czysto: pusty changes/

# R-061: zasymuluj work-item 'ready' z niepokrytym AC → doctor zwraca WORKITEM:*:uncovered (exit≠0)
# R-060: uruchom qa-rca w narzędziu → powstaje context/changes/<id>/rca.md
```

Definicja „done" per item (konwencja ROADMAP): kod + testy (w tym parzystość) zielone,
ROADMAP flip na ✅ z wersją+commitem, bump wersji pakietów, aktualizacja PRD/TECH;
`doctor` czysty przed shipem.

## Świadome nie-cele
- Walidacja **semantycznej** poprawności treści (czy RCA trafne) — zostaje przy
  `qa-gardening` (doradczo).
- Rejestr **wszystkich** artefaktów (foundation/reference) — poza zakresem startowym.
- Rubryka/score jakości (opcja 4 z sesji) — świadomie pominięta.
