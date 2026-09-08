# BUILD REPORT: Sistema de Registro de Reposição em Vending Machine

> Implementation report for REPOSICAO_VENDING

## Metadata

| Attribute | Value |
|---|---|
| **Feature** | REPOSICAO_VENDING |
| **Date** | 2026-09-08 |
| **Author** | SDD Build by RDD |
| **BRAINSTORM** | `BRAINSTORM_REPOSICAO_VENDING.md` |
| **DEFINE** | `DEFINE_REPOSICAO_VENDING.md` |
| **DESIGN** | `DESIGN_REPOSICAO_VENDING.md` |
| **Status** | Complete |

---

## Mode Selection

| Signal | Observation |
|---|---|
| Manifest files | 52 |
| Cross-file coupling | High — quase todo módulo depende de `src/domain/types.ts`, do schema SQLite (`src/db/schema.sql`) e dos repositories; nomes/contratos compartilhados entre domain → repos → API → UI |
| Security surface | Sim — token de dispositivo (hash SHA-256), sessão admin (cookie assinado + Argon2), cifragem AES-256-GCM da credencial do VendPago, ReadOnly Guard do Playwright |
| LLM prompt items | Nenhum (`LLM Prompts: false` no DEFINE; sem `## LLM Prompts` no DESIGN) |
| Independent volume | O worker (5 arquivos) é razoavelmente isolado da app web, mas ambos compartilham schema e tipos de domínio |
| Context-rot risk | Moderado dado o volume (52 arquivos), mitigado por execução sequencial no mesmo contexto |
| Runtime capabilities | Agent tool (subagentes) disponível nesta sessão — supportaria `ralph`; não usado por escolha do usuário |

**Recommendation:** `default` — alto acoplamento cross-file (tipos e contratos compartilhados) torna coerência mais valiosa que contexto limpo por tarefa.

**User decision:** `default` (confirmado via AskUserQuestion antes da primeira alteração).

**Pre-build review:** Not available — nenhuma ferramenta de revisão externa formal conectada nesta sessão. Decisão do usuário: revisão interna pós-build (skill `code-review`, nível `high`) focada nos arquivos de superfície de segurança, em vez de revisão pré-build.

---

## Summary

| Metric | Value |
|---|---|
| **Tasks Completed** | 52/52 itens do File Manifest |
| **Files Created** | 54 (52 do manifest + 2 companheiros mínimos necessários — ver Drift Detected) |
| **Files Modified** | 0 (build greenfield; correções pós-review foram feitas nos próprios arquivos recém-criados, antes de qualquer commit) |
| **Files Deleted** | 1 (`next.config.ts`, substituído por `next.config.mjs` — ver Drift Detected) |
| **Verification Commands Run** | 9 (`tsc --noEmit` ×2, `npm test` ×3, `eslint` ×2, `next build` ×2) |
| **Verify Gate** | Green (exit 0) |
| **Execution Mode** | default |

---

## Task Execution

| # | Manifest ID(s) | Task | Executor | Status | Verification | Evidence |
|---:|---:|---|---|---|---|---|
| 1 | 1–8 | Scaffolding (package.json, tsconfig, vitest.config, next.config, .env.example, Docker, README) | direct | Complete | `npm install` | 413→444 pacotes instalados sem erro |
| 2 | 9–11 | `src/lib`: config, logger, crypto | direct | Complete | `tsc --noEmit` | 0 erros |
| 3 | 12–14 | `src/db`: schema.sql, client.ts, migrate.ts | direct | Complete | `tsc --noEmit` + uso em testes de repo | 0 erros; `tests/domain/visita.test.ts` aplica migrations em SQLite `:memory:` |
| 4 | 15–18 | `src/domain`: types, roteiro, estoque, visita | direct | Complete | `vitest run tests/domain/*` | 18 testes verdes |
| 5 | 19–23 | `src/repos`: produtos, molas, visitas, snapshots, dispositivos | direct | Complete | uso indireto em `tests/domain/visita.test.ts` e `tests/api/visitas.test.ts` | verde |
| 6 | 24–25 | `src/lib/auth.ts`, `src/lib/offlineBuffer.ts` | direct | Complete | `vitest run tests/lib/offlineBuffer.test.ts` + `tests/api/visitas.test.ts` | 4 + 15 testes verdes |
| 7 | 26–32 | UI: layout, `/v/[token]`, `/roteiro/[id]`, `/admin/*` | direct | Complete | `next build` | build de produção compilou e gerou as 8 rotas |
| 8 | 33–37 | API Routes: visitas, itens, fechar, digitada, estoque | direct | Complete | `vitest run tests/api/visitas.test.ts` | 15 testes verdes (contratos HTTP e autorização) |
| 9 | 38–42 | Worker: readOnlyGuard, scraper, parser, sync, index | direct | Complete | `vitest run tests/worker/*` | 14 testes verdes |
| 10 | 43–52 | manifest.webmanifest + todos os arquivos de teste + fixture | direct | Complete | `npm test` | 51/51 testes |
| 11 | — | Verify Gate do DEFINE | direct | Complete | `npm test` | exit 0 |
| 12 | — | Revisão de segurança pós-build + correções + BUILD_REPORT | direct | Complete | `code-review` (skill, high) + `npm test`/`tsc`/`eslint`/`next build` após correções | 4 achados corrigidos; todas as verificações voltaram a verde |

---

## Files Changed

| File | Action | Manifest ID | Verified | Notes |
|---|---|---:|---|---|
| `package.json` | Create | 1 | Yes | inclui `argon2` e `cheerio`, não previstos no Design mas necessários (ver Drift) |
| `tsconfig.json` | Create | 2 | Yes | `strict: true`; `allowJs: true` adicionado automaticamente pelo `next build` |
| `vitest.config.ts` | Create | 3 | Yes | inclui `test.env` com variáveis obrigatórias para os testes (ver Drift) |
| `next.config.mjs` | Create (substitui `next.config.ts`) | 4 | Yes | Next 14 não suporta `next.config.ts` (ver Drift) |
| `.env.example` | Create | 5 | Yes | — |
| `Dockerfile` | Create | 6 | Yes | não executado nesta sessão (sem Docker disponível); revisado manualmente |
| `docker-compose.yml` | Create | 7 | Yes | idem |
| `README.md` | Create | 8 | Yes | — |
| `src/lib/config.ts` | Create | 9 | Yes | credenciais do VendPago isoladas em `getErpCredentials()` (ver Drift) |
| `src/lib/logger.ts` | Create | 10 | Yes | — |
| `src/lib/crypto.ts` | Create | 11 | Yes | — |
| `src/db/schema.sql` | Create | 12 | Yes | — |
| `src/db/client.ts` | Create | 13 | Yes | — |
| `src/db/migrate.ts` | Create | 14 | Yes | — |
| `src/domain/types.ts` | Create | 15 | Yes | inclui `SnapshotItemInput` (adição aditiva, ver Drift) |
| `src/domain/roteiro.ts` | Create | 16 | Yes | segue Pattern 2 do DESIGN |
| `src/domain/estoque.ts` | Create | 17 | Yes | — |
| `src/domain/visita.ts` | Create | 18 | Yes | — |
| `src/repos/produtos.ts` | Create | 19 | Yes | — |
| `src/repos/molas.ts` | Create | 20 | Yes | — |
| `src/repos/visitas.ts` | Create | 21 | Yes | segue Pattern 3 do DESIGN (upsert idempotente) |
| `src/repos/snapshots.ts` | Create | 22 | Yes | — |
| `src/repos/dispositivos.ts` | Create | 23 | Yes | — |
| `src/lib/auth.ts` | Create | 24 | Yes | corrigido no pós-review: `isAdminRequestAuthorized` extraído |
| `src/lib/offlineBuffer.ts` | Create | 25 | Yes | — |
| `src/app/layout.tsx` | Create | 26 | Yes | — |
| `src/app/globals.css` | Create (não listado) | — | Yes | companheiro mínimo de `layout.tsx`; substitui Tailwind por CSS simples (ver Drift) |
| `src/app/v/[token]/page.tsx` | Create | 27 | Yes | — |
| `src/app/v/[token]/PlanogramaClient.tsx` | Create | 28 | Yes | — |
| `src/app/roteiro/[visitaId]/page.tsx` | Create | 29 | Yes | gateada por `requireAdminSession()` (ver Drift) |
| `src/app/admin/page.tsx` | Create | 30 | Yes | inclui o login admin (Server Action inline, ver Drift) |
| `src/app/admin/produtos/page.tsx` | Create | 31 | Yes | — |
| `src/app/admin/planograma/page.tsx` | Create | 32 | Yes | — |
| `src/app/api/visitas/route.ts` | Create | 33 | Yes | — |
| `src/app/api/visitas/[id]/itens/route.ts` | Create | 34 | Yes | corrigido no pós-review: log `auth.device.denied` adicionado |
| `src/app/api/visitas/[id]/fechar/route.ts` | Create | 35 | Yes | corrigido no pós-review: ordenação + transação atômica |
| `src/app/api/visitas/[id]/digitada/route.ts` | Create | 36 | Yes | corrigido no pós-review: usa `isAdminRequestAuthorized` |
| `src/app/api/estoque/route.ts` | Create | 37 | Yes | corrigido no pós-review: usa `isAdminRequestAuthorized` |
| `src/worker/vendpago/readOnlyGuard.ts` | Create | 38 | Yes | corrigido no pós-review: contrato mudado para não lançar de dentro do handler de rota |
| `src/worker/vendpago/scraper.ts` | Create | 39 | Yes | corrigido no pós-review: verifica `getBlockedAttempt()` |
| `src/worker/vendpago/parser.ts` | Create | 40 | Yes | bug corrigido na primeira rodada de testes (ver Issues Encountered) |
| `src/worker/sync.ts` | Create | 41 | Yes | — |
| `src/worker/index.ts` | Create | 42 | Yes | — |
| `public/manifest.webmanifest` | Create | 43 | Yes | `icons: []` (nenhum asset visual fornecido) |
| `tests/domain/roteiro.test.ts` | Create | 44 | Yes | AT-001, AT-002, AT-008 |
| `tests/domain/estoque.test.ts` | Create | 45 | Yes | AT-003 |
| `tests/domain/visita.test.ts` | Create | 46 | Yes | transições de estado + idempotência |
| `tests/worker/readOnlyGuard.test.ts` | Create | 47 | Yes | AT-004; reescrito no pós-review para o novo contrato |
| `tests/worker/parser.test.ts` | Create | 48 | Yes | — |
| `tests/worker/sync.test.ts` | Create | 49 | Yes | AT-005, AT-007 |
| `tests/lib/offlineBuffer.test.ts` | Create | 50 | Yes | AT-009 |
| `tests/api/visitas.test.ts` | Create | 51 | Yes | contratos HTTP e autorização por token |
| `tests/fixtures/vendpago-estoque.html` | Create | 52 | Yes | **sintético** — HTML real do VendPago nunca foi anexado (ver Deviations) |
| `.eslintrc.json` | Create (não listado) | — | Yes | necessário para o script `lint` de `package.json` funcionar (ver Drift) |

---

## Drift Detected

| # | Task / Path | Drift | Decision | Action |
|---:|---|---|---|---|
| 1 | `src/app/globals.css` (Planogram UI) | DESIGN nomeia "Next.js Client Component + Tailwind", mas o File Manifest não lista `tailwind.config`/`postcss.config` | Approved deviation | Implementado CSS simples e explícito em `globals.css` (toque grande, sem digitação livre) em vez de introduzir uma toolchain (Tailwind) com arquivos de configuração fora do manifest. Nenhum AT depende de Tailwind especificamente. |
| 2 | `next.config.ts` (item 4) | Next.js 14.2 (versão instalada) não suporta config nativo em TypeScript — erro de build | Approved deviation | Substituído por `next.config.mjs` com conteúdo equivalente. Não há requisito de versão específica do Next no DEFINE/DESIGN. |
| 3 | `.eslintrc.json` (não listado) | `package.json` (item 1) já define o script `lint`, mas ESLint não roda sem configuração | Approved deviation | Adicionado `.eslintrc.json` mínimo (`next/core-web-vitals`) — companheiro necessário de um arquivo já previsto no manifest. |
| 4 | Gestão de dispositivos (link secreto) | DESIGN (Data Flow, passo 2) narra "Operador gera link secreto por dispositivo", mas nenhum arquivo do manifest é uma página de gestão de dispositivos | Approved deviation | Mantido como operação de repositório (`criarDispositivo`/`revogarDispositivo`), documentada no README, sem adicionar página fora do manifest. |
| 5 | `src/app/roteiro/[visitaId]/page.tsx` (item 29) | Dependências listadas no manifest para o item 29 não incluem `24` (auth), mas a página expõe dados operacionais equivalentes ao `/admin` | Approved deviation | Página protegida por `requireAdminSession()`, consistente com a Security Consideration "Sem essa sessão, cadastro e estoque são inacessíveis". |
| 6 | Login administrativo | Nenhum arquivo do manifest é uma rota de login admin | Approved deviation | Implementado como Server Action inline dentro de `src/app/admin/page.tsx` (padrão idiomático do App Router), sem novo arquivo. |
| 7 | `src/lib/config.ts` (item 9) | O Code Pattern 4 do DESIGN exige `VENDPAGO_USER`/`VENDPAGO_PASSWORD_ENC`/`ENCRYPTION_KEY` no mesmo objeto `config`, mas a Security Consideration exige que a credencial do VendPago fique "ausente do processo web" | Approved deviation | Credenciais do ERP movidas para `getErpCredentials()`, resolvida só sob demanda (chamada apenas pelo worker), preservando o requisito de segurança sem quebrar o boot do processo web. |
| 8 | Observability (tabela `metricas`) | O DESIGN menciona uma tabela `metricas`, mas `schema.sql` (item 12) não a inclui em seu propósito e não há repo dedicado | Approved deviation | Métricas (sincronizações ok/falha, idade do snapshot, pendência de digitação) derivadas por consulta sobre `snapshots`/`visitas` existentes, sem tabela nova. |
| 9 | `src/domain/types.ts` (item 15) | Parser produz itens sem `snapshotId` (que só existe no momento da persistência) | Approved deviation | Adicionado o tipo aditivo `SnapshotItemInput = Omit<SnapshotItem, "snapshotId">` no mesmo arquivo já previsto — sem novo arquivo. |
| 10 | `tests/fixtures/vendpago-estoque.html` (item 52) | O DEFINE lista como Open Question a ausência do HTML real do VendPago | Approved deviation | Fixture sintética construída a partir da estrutura descrita no DEFINE/DESIGN, deixando os seletores do parser claramente documentados para ajuste após a primeira sincronização real (Risco já previsto no DESIGN). |

---

## Verification Results

### Incremental Verification

| Task | Command / Method | Result | Evidence |
|---|---|---|---|
| Scaffolding | `npm install` | Pass | 413 pacotes instalados |
| Domínio + Repos + DB | `npx tsc --noEmit` | Pass | 0 erros |
| Domínio (roteiro/estoque/visita) | `vitest run tests/domain` | Pass | 18/18 testes |
| Auth + Offline Buffer | `vitest run tests/lib/offlineBuffer.test.ts` | Pass | 4/4 testes |
| API Routes | `vitest run tests/api/visitas.test.ts` | Pass | 15/15 testes |
| Worker (guard/parser/sync) | `vitest run tests/worker` | Pass | 14/14 testes (após correção do parser) |
| UI + Routing completos | `next build` (com env vars de exemplo) | Pass | 8 rotas geradas sem erro |
| Correções pós-review | `npx tsc --noEmit && npm test && npx eslint . && next build` | Pass | 0 erros / 51 testes / 0 lint / build ok |

### Verify Gate

| Attribute | Value |
|---|---|
| **Kind** | test |
| **Command / Method** | `npm test` (Vitest) |
| **Exit / Result** | 0 |
| **Status** | Green |
| **Evidence** | `Test Files 8 passed (8)` / `Tests 51 passed (51)` — executado duas vezes (antes e depois das correções pós-review), ambas com exit 0 |

### Manual UX Receipt

N/A para o Verify Gate do DEFINE (kind: test). Ver AT-006 em Acceptance Test Verification — é o único item que exige checklist manual, e permanece **pendente** (ver Issues Encountered).

### Complementary Checks

| Check | Command / Method | Status | Evidence |
|---|---|---|---|
| Lint | `npx eslint . --ext .ts,.tsx` | Pass | exit 0, sem saída |
| Typecheck | `npx tsc --noEmit` | Pass | exit 0, sem saída |
| Tests | `npm test` | Pass | 51/51, exit 0 |
| Build / Compile | `next build` (com env vars mínimas) | Pass | 8 rotas compiladas, sem erro |

---

## Acceptance Test Verification

| ID | Scenario | Status | Evidence |
|---|---|---|---|
| AT-001 | Roteiro contém apenas molas alteradas, ordenado por posição | Pass | `tests/domain/roteiro.test.ts` + `tests/api/visitas.test.ts` ("fecha a visita e recebe o roteiro") |
| AT-002 | Troca de produto identificada no roteiro | Pass | `tests/domain/roteiro.test.ts` ("AT-002") |
| AT-003 | Estoque exibe quantidade do VendPago e pendência de visitas fechadas não digitadas | Pass | `tests/domain/estoque.test.ts` |
| AT-004 | Interação com o VendPago exclusivamente por leitura | Pass | `tests/worker/readOnlyGuard.test.ts` (GET permitido, POST/PUT/DELETE/PATCH bloqueados e registrados) |
| AT-005 | Snapshot de estoque registrado a cada execução agendada | Pass | `tests/worker/sync.test.ts` ("AT-005") |
| AT-006 | Visita completa registrada em até 120 segundos | **Pending** | Requer cronômetro em campo com uma visita real (gate `manual-ux`); não executável neste ambiente remoto sem a máquina física. UI implementada para minimizar toques (grid + stepper, sem digitação livre). |
| AT-007 | Falha de sincronização preserva último snapshot válido e sua data | Pass | `tests/worker/sync.test.ts` ("AT-007") |
| AT-008 | Mola não alterada é omitida do roteiro | Pass | `tests/domain/roteiro.test.ts` ("AT-008") |
| AT-009 | Buffer offline preserva itens e reenvia ao restabelecer conexão | Pass | `tests/lib/offlineBuffer.test.ts` + idempotência confirmada em `tests/api/visitas.test.ts` |
| Verify Gate | `npm test` → exit 0 | Pass | ver seção Verify Gate acima |

---

## Advisor Ledger

Revisão pós-build interna via skill `code-review` (nível `high`), escopo: `src/lib/auth.ts`, `src/lib/crypto.ts`, `src/worker/vendpago/readOnlyGuard.ts`, `src/repos/dispositivos.ts`, as 5 API routes de visitas/estoque, e `src/app/admin/page.tsx`.

| # | Phase | Note | Severity | Decision | Evidence |
|---:|---|---|---|---|---|
| 1 | post-build | `WriteAttemptError` lançado de dentro do handler de `context.route()` nunca chega ao chamador como esse tipo — o Playwright invoca o handler a partir de um listener de evento não aguardado, então o erro vira unhandled rejection em vez de propagar para `page.goto()`/`page.click()`; `coletarComRetry` nunca via o `WriteAttemptError` e retentava uma tentativa de escrita bloqueada, contradizendo a invariante do Decision 2 | HIGH | APPLIED | Verificado lendo `node_modules/playwright-core/lib/coreBundle.js` (`_onRoute`/`RouteHandler._handleImpl`). Corrigido: `applyReadOnlyGuard` agora retorna um handle com `getBlockedAttempt()`; `scraper.ts` verifica o handle em um `try/catch` ao redor de toda a sequência guardada e lança `WriteAttemptError` de dentro de uma função `async` normal (não de um listener). `tests/worker/readOnlyGuard.test.ts` reescrito para o novo contrato; `npm test` voltou a verde (51/51) |
| 2 | post-build | Log `auth.device.denied` presente em `POST /api/visitas` mas ausente nos checks idênticos de `/itens` e `/fechar`, criando ponto cego de observabilidade para tentativas de token inválido nesses dois endpoints | MEDIUM | APPLIED | Adicionado `logger.warn("auth.device.denied", ...)` nos dois arquivos, igualando ao padrão já usado em `src/app/api/visitas/route.ts` |
| 3 | post-build | `POST /api/visitas/[id]/fechar` persistia `status='fechada'` antes de gerar o roteiro e atualizar o planograma, sem transação; uma falha em `gerarRoteiro` (ex.: mola ausente) deixava a visita presa em 'fechada' sem roteiro, e uma nova tentativa de fechamento passava a devolver 409 permanentemente | HIGH | APPLIED | Reordenado: `gerarRoteiro` agora roda antes de qualquer escrita; a atualização de status e as trocas de produto no planograma foram agrupadas em um único `db.transaction()`. `tests/api/visitas.test.ts` ("fecha a visita e recebe o roteiro") continua verde |
| 4 | post-build | Checagem de sessão admin (`cookie` + `verifyAdminSessionValue` + 401) duplicada verbatim entre `estoque/route.ts` e `digitada/route.ts` | LOW | APPLIED | Extraído `isAdminRequestAuthorized(request)` em `src/lib/auth.ts`, usado nos dois arquivos |

---

## Issues Encountered

| # | Issue | Resolution | Impact |
|---:|---|---|---|
| 1 | `Number("")` avalia para `0` (não `NaN`) em JavaScript — o parser aceitava silenciosamente uma célula de quantidade vazia como `quantidade: 0` em vez de descartar a linha malformada | Corrigido em `src/worker/vendpago/parser.ts`: string vazia é tratada explicitamente como `NaN` antes de `Number.isFinite` | Encontrado na primeira execução do Verify Gate (`npm test`); corrigido e reverificado no mesmo turno (retry ladder, primeira falha) |
| 2 | `next.config.ts` não é suportado pelo Next.js 14.2 instalado | Substituído por `next.config.mjs` (ver Drift #2) | Build de produção falhava antes da correção; após, `next build` passa |
| 3 | `experimental.serverComponentsExternalPackages` — a chave `serverExternalPackages` (nome usado no Design, válido a partir do Next 15) não existe no Next 14 | Corrigido para `experimental.serverComponentsExternalPackages`, chave equivalente na versão instalada | `next build` emitia aviso de chave desconhecida antes da correção |
| 4 | AT-006 (visita completa em até 120s) exige cronômetro em campo com a máquina física e um abastecedor real | Não executável neste ambiente remoto de codificação | Ver Acceptance Test Verification — status **Pending**, não bloqueia o Verify Gate do DEFINE (que é `npm test`, não `manual-ux`) |

---

## Deviations from Design

| Deviation | User Decision | Reason | Impact |
|---|---|---|---|
| Tecnologia de estilo: CSS simples em vez de Tailwind | Auto-aprovado (build autônomo) | Evitar arquivos de configuração (`tailwind.config`, `postcss.config`) fora do File Manifest | Nenhum — os requisitos de UI (toque grande, sem digitação livre) são atendidos |
| `next.config.ts` → `next.config.mjs` | Auto-aprovado (build autônomo) | Restrição de ferramental: Next.js 14 não suporta config nativo em TS | Nenhum — mesmo conteúdo funcional |
| Fixture de teste do parser é sintética, não uma captura real do VendPago | Já sinalizado como Open Question não resolvida no DEFINE | HTML real nunca foi anexado nesta ou em sessões anteriores (Assumption A-003 não validada) | O parser está testado e correto contra a estrutura assumida; seletores CSS podem precisar de ajuste após a primeira sincronização real contra o VendPago — documentado em comentário no próprio arquivo |
| AT-006 sem receipt manual | Não aplicável — build autônomo, sem acesso à máquina física | Validação exige cronômetro em campo com uma visita real | Feature entregue e testada automaticamente em tudo o mais; falta apenas a validação de campo, que só o usuário pode fornecer |

---

## Blockers

None.

---

## Final Status

### Overall: COMPLETE

- [x] All File Manifest tasks completed
- [x] Incremental verification recorded
- [x] Verify Gate green (`npm test` → exit 0)
- [x] Complementary checks applicable pass (lint, typecheck, build)
- [x] Acceptance Tests verified (8/9 automatizados; AT-006 pendente de validação manual em campo — não bloqueia o Verify Gate do DEFINE)
- [x] LLM prompt receipts complete when required (N/A — `LLM Prompts: false`)
- [x] Drift decisions recorded
- [x] Advisor findings disposed (4/4 APPLIED)
- [x] No unresolved blocker
- [x] No TODO/FIXME used as unfinished implementation

---

## Next Step

Fluxo SDD concluído. Revise o BUILD_REPORT e publique conforme o processo de release do seu projeto.
