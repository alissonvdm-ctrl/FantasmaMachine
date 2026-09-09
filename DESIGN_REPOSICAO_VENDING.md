# DESIGN: Sistema de Registro de Reposição em Vending Machine

> Technical design for implementing REPOSICAO_VENDING

## Metadata

| Attribute | Value |
|---|---|
| **Feature** | REPOSICAO_VENDING |
| **Date** | 2026-09-08 |
| **Author** | SDD Design by RDD |
| **BRAINSTORM** | `BRAINSTORM_REPOSICAO_VENDING.md` |
| **DEFINE** | `DEFINE_REPOSICAO_VENDING.md` |
| **UX REVIEW** | N/A |
| **LLM Prompts** | false |
| **Status** | Ready for Build |

---

## Architecture Overview

```text
        CAMPO                          GESTÃO
  ┌──────────────────┐          ┌──────────────────┐
  │ Abastecedor      │          │ Operador         │
  │ (celular)        │          │ (desktop)        │
  └────────┬─────────┘          └────────┬─────────┘
           │ link secreto                │ sessão admin
           ▼                             ▼
  ┌─────────────────────────────────────────────────┐
  │            Next.js App (App Router)             │
  │                                                 │
  │  /v/[token]      /roteiro/[id]     /admin/*     │
  │  planograma      roteiro de        produtos e   │
  │  de toque        digitação         planograma   │
  ├─────────────────────────────────────────────────┤
  │              Route Handlers (/api)              │
  ├─────────────────────────────────────────────────┤
  │   Domain: roteiro.ts · estoque.ts · visita.ts   │
  ├─────────────────────────────────────────────────┤
  │            Repositories (better-sqlite3)        │
  └───────────────────────┬─────────────────────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │  SQLite (arquivo)│
                 │  molas, visitas, │
                 │  snapshots       │
                 └────────▲─────────┘
                          │ escreve snapshots
           ┌──────────────┴───────────────┐
           │      Sync Worker (processo   │
           │      separado, node-cron 3x) │
           │  ┌────────────────────────┐  │
           │  │ Playwright + ReadOnly  │  │
           │  │ Guard (bloqueia !GET)  │  │
           │  └───────────┬────────────┘  │
           └──────────────┼───────────────┘
                          │ somente leitura
                          ▼
                 ┌──────────────────┐
                 │  ERP VendPago    │
                 │ erpvending.com.br│
                 └──────────────────┘
```

---

## Components

| Component | Purpose | Technology / Pattern | Inputs | Outputs | Dependencies |
|---|---|---|---|---|---|
| Planogram UI | Grade de molas em toque; registra quantidade e troca | Next.js Client Component + Tailwind | Token de dispositivo, planograma | Itens de visita | API Routes, Offline Buffer |
| Offline Buffer | Preserva itens da visita durante queda de conexão | IndexedDB via wrapper próprio | Eventos de toque | Fila de itens pendentes | Nenhuma |
| Roteiro UI | Lista ordenada de molas alteradas para digitação | Next.js Server Component | ID da visita | Roteiro renderizado | Domain Roteiro |
| Admin UI | Cadastro de produtos e planograma; visão de estoque | Next.js Server Components | Sessão admin | Mutações de cadastro | Repositories |
| API Routes | Contratos HTTP de visita, itens, fechamento e estoque | Next.js Route Handlers | JSON | JSON | Domain, Auth |
| Domain: Visita | Máquina de estados aberta → fechada → digitada | Módulo TS puro | Itens brutos | Visita consistente | Repositories |
| Domain: Roteiro | Filtra molas alteradas e ordena por posição | Módulo TS puro (determinístico) | Visita fechada | Linhas do roteiro | Nenhuma |
| Domain: Estoque | Cruza snapshot do VendPago com visitas não digitadas | Módulo TS puro | Snapshot + visitas | Visão por mola com pendência | Nenhuma |
| Repositories | Acesso a dados com SQL explícito | better-sqlite3 + SQL | Parâmetros tipados | Entidades | SQLite |
| Auth (device token) | Valida link secreto; escopo restrito a visita | Hash SHA-256 + comparação constante | Token da URL | Dispositivo ou 401 | Repositories |
| Auth (admin) | Sessão de administração por senha | Cookie assinado httpOnly | Senha | Sessão | Config |
| Sync Worker | Executa a leitura agendada 3x ao dia | Processo Node separado + node-cron | Cron trigger | Snapshot persistido | Scraper |
| VendPago Scraper | Navega e extrai o estoque | Playwright (Chromium headless) | Credencial cifrada | HTML/estruturas brutas | ReadOnly Guard |
| ReadOnly Guard | Aborta qualquer requisição não-GET ao domínio do ERP | Playwright route interception | Requisições do browser | Abort + erro | Nenhuma |
| Snapshot Parser | Converte a página em linhas mola/produto/quantidade | Módulo TS puro | HTML | SnapshotItem[] | Nenhuma |

---

## Key Decisions

### Decision 1: Robô de leitura isolado em processo separado

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-08 |
| **Source** | DEFINE (constraint de navegador headless) |

**Context:** O Chromium headless consome memória e leva dezenas de segundos por execução. Rodá-lo dentro do processo do Next.js degradaria a resposta da UI justamente durante o registro em campo.

**Choice:** Worker Node autônomo, com seu próprio ciclo de vida, escrevendo snapshots no mesmo arquivo SQLite.

**Rationale:** Falha, reinício ou lentidão do robô não afetam a aplicação web. O abastecedor sempre consegue registrar.

**Alternatives Rejected:**
1. Scraping dentro de uma Route Handler — acopla latência de terceiro ao caminho crítico do usuário.
2. Serviço externo de scraping — dependência e custo desnecessários para uma máquina.

**Consequences:**
- Dois processos para operar e monitorar.
- SQLite exige modo WAL para leitura concorrente segura.

### Decision 2: ReadOnly Guard como mecanismo executável, não convenção

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-08 |
| **Source** | DEFINE (AT-004, Out of Scope) |

**Context:** A decisão de não escrever no ERP é a principal salvaguarda do projeto. Uma regra apenas documentada quebra no primeiro refactor.

**Choice:** Interceptar todas as requisições do contexto Playwright e abortar qualquer método diferente de GET dirigido ao domínio do VendPago, lançando erro que falha a sincronização.

**Amendment (2026-09-08, pós-reconhecimento em produção):** O login real do VendPago exige POST para `/auth/login/index` (form com `#username`/`#password`/botão `#login`) — sem esse POST não há como autenticar, então o guard original bloquearia até o próprio login. `applyReadOnlyGuard` passou a aceitar uma lista explícita de prefixos de caminho liberados para escrita (`allowedWritePathPrefixes`), usada exclusivamente para `/auth/login`. Continua bloqueando qualquer outro POST/PUT/DELETE/PATCH no host do ERP — a exceção é auditável, mínima e documentada, não uma abertura geral.

**Amendment (2026-09-08, 2ª rodada de reconhecimento):** A tela `/produtos` do VendPago carrega sua tabela via POST em `/produtos/listar/format/json` (padrão DataTables server-side: paginação/ordenação via POST, corpo sem efeito colateral de negócio — apenas parâmetros de listagem). Bloquear esse POST como "escrita" impede a própria leitura que o guard deveria viabilizar. `applyReadOnlyGuard` passou a aceitar também `allowedReadListingPathPatterns`: uma lista de substrings de path que, quando presentes, classificam o POST como leitura de listagem (não escrita de negócio) mesmo sem método GET.

**Amendment (2026-09-08, 3ª rodada de reconhecimento):** A tela `/estoque-interno/relatorio-estoque` usa o mesmo padrão, mas com outro verbo: `POST /estoque-interno/carregaRelatorioEstoque/format/json` — `/listar/` não cobria esse caso e o guard voltou a bloquear a leitura. O verbo muda por tela (`listar`, `carregaRelatorioEstoque`, ...), mas o sufixo `/format/json` é comum a ambas e é a convenção do próprio framework VendPago para resposta JSON de endpoints de leitura tabular. `allowedReadListingPathPatterns` passou a usar `/format/json` em vez de `/listar/` — mais genérico e robusto a novas telas de listagem (estoque da máquina/molas em portalvendtef.com.br, ainda não confirmado) sem exigir um novo amendment por tela. Continua bloqueando qualquer POST fora de `/auth/login` e fora desse sufixo.

**Amendment (2026-09-08, 4ª rodada de reconhecimento — SSO cross-domain):** O estoque da máquina/molas fica em `portalvendtef.com.br`, um domínio irmão de `erpvending.com.br` (mesma conta VendPago, produtos distintos: ERP, VendTEF, PayBlu). Navegar direto para uma URL de `portalvendtef.com.br` depois de logar em `erpvending.com.br` cai de volta na tela de login — a sessão não é compartilhada automaticamente entre domínios. A página autenticada do ERP expõe, nas abas de navegação, um link de handoff de SSO com token de uso único por sessão (`https://www.portalvendtef.com.br/token/<token>/link_redirect/;/banco_redirect/op_loja_fantasma/oid/<id>/client_redirect/`) — visitar esse link antes da URL de destino real estabelece a sessão lá. `encontrarLinkHandoffSso(links, hostDestino)` (scraper.ts) localiza esse link entre os links da página logo após o login; o fluxo passa a ser login → extrair links → (se o destino for outro host) visitar o link de handoff → navegar para a URL de destino real. O token é obtido dinamicamente a cada execução (não é hardcoded), já que é de uso único/vinculado à sessão.

**Rationale:** Transforma "somente leitura" em invariante verificável por teste automatizado, satisfazendo AT-004 sem depender de disciplina humana.

**Alternatives Rejected:**
1. Revisão de código como única garantia — não é testável.
2. Usuário com permissão de leitura no ERP — o VendPago não expõe esse controle de forma confirmada.

**Consequences:**
- Qualquer necessidade futura de escrita exige remoção explícita e consciente do guard.
- Pequeno overhead por requisição interceptada.

### Decision 3: SQLite com WAL como persistência única

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-08 |
| **Source** | Clarificação técnica do usuário |

**Context:** Uma máquina, dezenas de molas, três sincronizações diárias e visitas esporádicas.

**Choice:** Arquivo SQLite acessado por better-sqlite3, com `journal_mode=WAL`, migrations em SQL versionado.

**Rationale:** Volume trivial não justifica servidor de banco. Backup é copiar um arquivo.

**Alternatives Rejected:**
1. PostgreSQL em container — infraestrutura desproporcional ao volume.

**Consequences:**
- Escala para múltiplas máquinas exigiria revisão (já fora de escopo).
- App e worker precisam compartilhar volume de disco.

### Decision 4: Autenticação do abastecedor por link secreto de escopo restrito

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-08 |
| **Source** | Clarificação técnica do usuário |

**Context:** O requisito de 120 segundos por visita não tolera tela de login. O usuário optou por link secreto por dispositivo.

**Choice:** URL contendo token aleatório de 32 bytes. O banco guarda apenas o hash SHA-256. O token autoriza exclusivamente abrir visita, registrar itens e fechar visita — nunca administração nem leitura de estoque histórico.

**Rationale:** Elimina digitação em campo. O escopo restrito limita o dano de um vazamento ao registro de dados operacionais de uma máquina.

**Alternatives Rejected:**
1. PIN numérico — mais seguro contra vazamento de URL, porém adiciona atrito na abertura.
2. Usuário e senha — atrito incompatível com o alvo de tempo.

**Consequences:**
- Token vaza por histórico do navegador, print ou compartilhamento; mitigado por revogação por dispositivo.
- Exige campo `ativo` e trilha de qual dispositivo registrou cada visita.

### Decision 5: Roteiro determinístico gerado do diff, não do estado

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-08 |
| **Source** | DEFINE (AT-001, AT-008) |

**Context:** Molas não tocadas devem sumir do roteiro; molas alteradas devem aparecer em ordem de posição.

**Choice:** Função pura `gerarRoteiro(visita, planograma)` que recebe apenas itens registrados e devolve linhas ordenadas, sem consultar o snapshot do VendPago.

**Rationale:** O roteiro precisa funcionar mesmo com o robô fora do ar, e função pura é trivialmente testável contra AT-001 e AT-008.

**Alternatives Rejected:**
1. Roteiro derivado da diferença contra o snapshot — cria dependência do robô no caminho crítico.

**Consequences:**
- O roteiro não sinaliza divergência com o ERP; essa informação vive na tela de estoque.

### Decision 6: Administração protegida por sessão de senha única

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-08 |
| **Source** | Inferência técnica marcada — não especificada no DEFINE |

**Context:** O DEFINE define autenticação do abastecedor, mas não da administração, que expõe cadastro e estoque.

**Choice:** Senha única de operador, hash em variável de ambiente, cookie de sessão assinado e httpOnly.

**Rationale:** Um único operador (Assumption A-006). Multiusuário está fora de escopo.

**Alternatives Rejected:**
1. Área administrativa aberta — expõe cadastro e estoque a quem tiver a URL.
2. Provedor de identidade externo — desproporcional para um usuário.

**Consequences:**
- Trocar a senha exige redeploy da variável de ambiente.
- Se A-006 for falsa, exige revisão para multiusuário.

### Decision 7: Deploy em Vercel com Turso (libSQL) e sincronização acionada por HTTP

| Attribute | Value |
|---|---|
| **Status** | Accepted (supersede parcial da Decision 1) |
| **Date** | 2026-09-08 |
| **Source** | Decisão explícita do usuário, pós-Build |

**Context:** O Build inicial (v1.0) assumiu VPS/container com processo Node de vida longa (`node-cron`) e SQLite em arquivo local (`better-sqlite3`), conforme Decision 1 e Decision 3. O usuário pediu deploy em Vercel, que é serverless: não há disco persistente entre invocações de função, não há processo de longa duração, e o pacote de função tem limite de tamanho incompatível com o Chromium completo do Playwright.

**Choice:**
1. Substituir `better-sqlite3` por `@libsql/client`, apontando para um banco Turso (libSQL hospedado, SQL compatível com SQLite — mesmo DDL, mesmas queries com parâmetros nomeados). Localmente e em teste, o mesmo cliente aponta para `:memory:` ou um arquivo `file:`.
2. Substituir `playwright` (que baixa um Chromium completo) por `playwright-core` + `@sparticuz/chromium` (binário Linux x64 compacto, compatível com ambiente serverless e com container comum).
3. Substituir o processo `node-cron` standalone (`src/worker/index.ts`) por um endpoint HTTP protegido por segredo (`/api/cron/sync`), acionado externamente. Como o plano Vercel do usuário é Hobby (Cron nativo limitado a 1x/dia, incompatível com a exigência de 3x/dia do DEFINE/AT-005), o agendamento 3x/dia é feito por um workflow do GitHub Actions que chama o endpoint com o segredo — funciona independente do plano Vercel.
4. Substituir `argon2` (Decision 6) por `scrypt` (nativo do `node:crypto`) no hash da senha de administração. Descoberto em produção: o addon nativo do `argon2` não tem build disponível para o runtime serverless da Vercel (`Error: No native build was found for ... runtime=node abi=137`), quebrando `/admin` com 500. `scrypt` não depende de binário compilado, funciona em qualquer runtime Node e mantém a mesma garantia (KDF com custo de memória, hash+salt, comparação em tempo constante).
5. Embutir o DDL (`schema.sql` → `schema.ts`, string TS) em vez de ler um arquivo `.sql` em runtime. Descoberto em produção: o file tracing da função serverless da Vercel só empacota o que é importado como módulo JS/TS — `readFileSync` de um `.sql` solto falhava com `ENOENT` no ambiente publicado, mesmo funcionando localmente.
6. Adicionar `experimental.outputFileTracingIncludes` em `next.config.mjs` apontando para `node_modules/@sparticuz/chromium/bin/**/*`. Descoberto em produção: o binário do Chromium só é referenciado dinamicamente dentro do próprio pacote `@sparticuz/chromium`, então o file tracing da Vercel não o detectava e não o incluía no pacote da função, mesmo com o pacote marcado como externo.

**Rationale:** Mantém a lógica de domínio, o schema e os testes praticamente intactos (libSQL é SQL-compatível com SQLite); resolve as três incompatibilidades reais com serverless (disco, processo longo, tamanho do binário do Chromium) sem reescrever a aplicação.

**Alternatives Rejected:**
1. Vercel Postgres — exigiria reescrever todo o SQL dos repositories (sintaxe/tipos diferentes de SQLite), contrariando a Decision 3 original sem necessidade.
2. Manter `node-cron` num processo separado sempre ativo — inviável em Vercel (sem processo de longa duração).
3. Depender só do Vercel Cron nativo — não atende ao AT-005 (3x/dia) no plano Hobby do usuário.

**Consequences:**
- Toda a camada de dados passa a ser assíncrona (Client/Transaction do libSQL), com impacto em todos os repositories, rotas de API, Server Components e testes que tocam o banco.
- Depender de disponibilidade e latência de rede até o Turso (antes era leitura/escrita local em arquivo).
- Dois segredos adicionais em produção: `DATABASE_AUTH_TOKEN` (Turso) e `CRON_SECRET` (protege o endpoint de sincronização).
- O caminho de deploy self-hosted (Docker/VPS) documentado no README continua funcional: o container roda só a app (sem processo worker separado) e qualquer agendador externo (crontab do host, GitHub Actions) pode chamar o mesmo `/api/cron/sync`.

### Decision 8: Extração real de dados via reconhecimento em produção (parser + scraper)

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-09 |
| **Source** | Reconhecimento em produção via endpoint de diagnóstico (`/api/setup/inspect`) |

**Context:** O parser e o scraper originais (v1.0) foram escritos sem nunca ter visto o HTML real do VendPago — a estrutura verdadeira das telas só foi confirmada depois, navegando com o endpoint de diagnóstico (Decision 2, amendments 2-4). Duas fontes de dados ficaram confirmadas: `/produtos` (erpvending.com.br, catálogo paginado) e o relatório de estoque da máquina (portalvendtef.com.br, após handoff de SSO), cada uma com uma particularidade que o parser original não previa.

**Choice:**
1. `parseProdutosHtml`/`parseEstoqueHtml` (parser.ts) identificam a tabela certa pelo **texto do cabeçalho** (ex.: colunas contendo "Nome"/"Situação", ou "Seleção"/"Produto"/"Disponível"), não por id/classe CSS — o VendPago não expõe ids estáveis nas tabelas em si, só nalguns controles avulsos (ex.: paginação).
2. O código do produto (mesmo id usado em `/produtos/edit/pid/<id>`) vem embutido no fim do nome exibido, ex.: `"Acessórios - Shield Basico(#14)"` — extraído por regex, removendo antes o texto literal de ícones do Material Icons (`check_circle`, `warning`, ...) que aparece como conteúdo real de algumas células com indicador visual.
3. O relatório de estoque da máquina mostra o produto só pelo **nome**, sem código embutido — `parseEstoqueHtml` recebe um `mapaNomeParaCodigo` (construído a partir de `parseProdutosHtml` sobre todas as páginas de `/produtos`) para resolver o código real. Linha cujo nome não bate com nenhum produto conhecido é descartada.
4. `/produtos` pagina no máximo 20 itens (o seletor "Exibir" não oferece opção maior) — `coletarPaginasProdutos` (scraper.ts) clica no botão "próxima página" (`#produtos-table-pagination-buttons`, localizado por texto "chevron_right" — sem `href` real) até acumular o total anunciado em `#produtos-table-pagination-info`, sem assumir um número fixo de páginas.
5. Os percentuais/quantidades do relatório de estoque da máquina são preenchidos por uma animação de contagem após o carregamento — confirmado comparando a extração de tabela (vazia) com o texto da página capturado alguns milissegundos depois (correto). O scraper aguarda 1.5s após `networkidle` antes de capturar o HTML final.
6. Linha com quantidade disponível negativa (ex.: `"-2 / 12"`, uma venda além do estoque observada em produção — anomalia do próprio VendPago) é descartada pelo parser, não persistida: a coluna `snapshot_itens.quantidade` tem `CHECK (quantidade >= 0)`, e um valor negativo não é um estado físico válido de estoque.
7. `SincronizacaoDeps.coletarHtml` (uma string) virou `coletarDados` (`{ produtosHtmls: string[]; estoqueHtml: string }`) — a resolução de código por nome exige as duas fontes na mesma execução.

**Rationale:** Casar pelo cabeçalho e por sufixo de convenção (`/format/json`, ids de paginação) em vez de seletores CSS específicos é mais resiliente ao que já se mostrou instável entre reconhecimentos (o verbo do endpoint AJAX mudou por tela). Resolver o produto por nome (não por código) no relatório da máquina é a única opção disponível — a tela não expõe o código ali.

**Alternatives Rejected:**
1. Selecionar células por posição fixa (índice de coluna hardcoded) — quebra silenciosamente se o VendPago reordenar colunas; o cabeçalho é a fonte de verdade real da tela.
2. Persistir a linha com quantidade negativa clampada em 0 em vez de descartá-la — mudaria um dado que o próprio VendPago está inconsistente sobre, sem necessidade: a linha anterior/seguinte do mesmo snapshot já reflete o estado real assim que a inconsistência se resolve no ERP.

**Consequences:**
- Uma sincronização faz uma requisição adicional (todas as páginas de `/produtos`) antes de ler o estoque da máquina — mais lento que ler só uma tela, mas necessário para resolver os códigos.
- `estoque-interno/relatorio-estoque` (estoque fora da máquina) permanece confirmado como acessível (Decision 2, 3ª rodada) mas **não está incorporado ao domínio/sync** ainda — o schema atual (`Snapshot`/`SnapshotItem`) é escopado a estoque por mola da máquina; usar aquela tela exigiria uma tabela/feature nova, fora do escopo desta correção.
- `produtos`/`molas` (tabelas de catálogo/planograma) continuam não seedadas automaticamente por este sync — o nome→código é resolvido em memória a cada execução, sem persistir o catálogo. Seed inicial de `produtos`/`molas` fica como próximo passo, se o usuário quiser essas telas administrativas populadas automaticamente também.

---

## File Manifest

| # | File | Action | Purpose | Agent / Owner | Dependencies |
|---:|---|---|---|---|---|
| 1 | `package.json` | Create | Dependências e scripts (`dev`, `build`, `test`, `worker`) | (general) | None |
| 2 | `tsconfig.json` | Create | Configuração TypeScript strict | (general) | 1 |
| 3 | `vitest.config.ts` | Create | Runner de testes do Verify Gate | (general) | 1 |
| 4 | `next.config.ts` | Create | Configuração Next.js e headers PWA | (general) | 1 |
| 5 | `.env.example` | Create | Contrato de configuração sem segredos reais | (general) | None |
| 6 | `Dockerfile` | Create | Imagem com Node e dependências do Chromium | (general) | 1 |
| 7 | `docker-compose.yml` | Create | Sobe app e worker compartilhando volume do SQLite | (general) | 6 |
| 8 | `README.md` | Create | Operação, backup e revogação de tokens | (general) | 5 |
| 9 | `src/lib/config.ts` | Create | Leitura e validação de variáveis de ambiente | (general) | 5 |
| 10 | `src/lib/logger.ts` | Create | Log estruturado JSON com correlação | (general) | 9 |
| 11 | `src/lib/crypto.ts` | Create | Cifra/decifra da credencial e hash de tokens | (general) | 9 |
| 12 | `src/db/schema.ts` (renomeado de `schema.sql` — Decision 7) | Create | DDL de produtos, molas, visitas, itens, snapshots, dispositivos, embutido como string TS | (general) | None |
| 13 | `src/db/client.ts` | Create | Conexão SQLite com WAL e foreign keys | (general) | 9 |
| 14 | `src/db/migrate.ts` | Create | Aplicação idempotente do schema | (general) | 12, 13 |
| 15 | `src/domain/types.ts` | Create | Tipos de domínio compartilhados | (general) | None |
| 16 | `src/domain/roteiro.ts` | Create | Geração determinística do roteiro de digitação | (general) | 15 |
| 17 | `src/domain/estoque.ts` | Create | Cruzamento snapshot × visitas não digitadas | (general) | 15 |
| 18 | `src/domain/visita.ts` | Create | Máquina de estados da visita e validações | (general) | 15 |
| 19 | `src/repos/produtos.ts` | Create | CRUD de produtos da lista fixa | (general) | 13, 15 |
| 20 | `src/repos/molas.ts` | Create | Leitura e atualização do planograma | (general) | 13, 15 |
| 21 | `src/repos/visitas.ts` | Create | Persistência de visitas e itens | (general) | 13, 15 |
| 22 | `src/repos/snapshots.ts` | Create | Persistência e leitura do último snapshot válido | (general) | 13, 15 |
| 23 | `src/repos/dispositivos.ts` | Create | Cadastro, hash e revogação de tokens | (general) | 11, 13 |
| 24 | `src/lib/auth.ts` | Create | Validação de token de dispositivo e sessão admin | (general) | 11, 23 |
| 25 | `src/lib/offlineBuffer.ts` | Create | Fila client-side em IndexedDB com reenvio | (general) | 15 |
| 26 | `src/app/layout.tsx` | Create | Layout raiz e registro do manifest PWA | (general) | 4 |
| 27 | `src/app/v/[token]/page.tsx` | Create | Entrada da visita autenticada por link | (general) | 24, 20 |
| 28 | `src/app/v/[token]/PlanogramaClient.tsx` | Create | Grade de molas em toque, quantidade e troca | (general) | 25, 15 |
| 29 | `src/app/roteiro/[visitaId]/page.tsx` | Create | Roteiro de digitação com marcação de lançado | (general) | 16, 21 |
| 30 | `src/app/admin/page.tsx` | Create | Visão de estoque com idade da sincronização | (general) | 17, 22, 24 |
| 31 | `src/app/admin/produtos/page.tsx` | Create | Cadastro da lista fixa de produtos | (general) | 19, 24 |
| 32 | `src/app/admin/planograma/page.tsx` | Create | Cadastro de molas, posições e capacidades | (general) | 20, 24 |
| 33 | `src/app/api/visitas/route.ts` | Create | Abertura de visita | (general) | 18, 21, 24 |
| 34 | `src/app/api/visitas/[id]/itens/route.ts` | Create | Registro idempotente de itens | (general) | 18, 21, 24 |
| 35 | `src/app/api/visitas/[id]/fechar/route.ts` | Create | Fechamento e geração do roteiro | (general) | 16, 18, 21 |
| 36 | `src/app/api/visitas/[id]/digitada/route.ts` | Create | Marcação de visita já lançada no ERP | (general) | 21, 24 |
| 37 | `src/app/api/estoque/route.ts` | Create | Visão consolidada de estoque e pendências | (general) | 17, 22, 24 |
| 38 | `src/worker/vendpago/readOnlyGuard.ts` | Create | Aborta requisições não-GET ao domínio do ERP | (general) | 10 |
| 39 | `src/worker/vendpago/scraper.ts` | Create | Login e navegação até a tela de estoque | (general) | 11, 38, 9 |
| 40 | `src/worker/vendpago/parser.ts` | Create | Extração de mola, produto e quantidade | (general) | 15 |
| 41 | `src/worker/sync.ts` | Create | Orquestra scrape, parse e persistência do snapshot | (general) | 22, 39, 40 |
| 42 | ~~`src/worker/index.ts`~~ | Removed (Decision 7) | Substituído pelo item 53 (endpoint HTTP) — Vercel não suporta processo de longa duração | (general) | — |
| 43 | `public/manifest.webmanifest` | Create | Instalação como PWA no celular | (general) | None |
| 44 | `tests/domain/roteiro.test.ts` | Create | AT-001, AT-002, AT-008 | (general) | 16 |
| 45 | `tests/domain/estoque.test.ts` | Create | AT-003 | (general) | 17 |
| 46 | `tests/domain/visita.test.ts` | Create | Transições de estado e idempotência | (general) | 18 |
| 47 | `tests/worker/readOnlyGuard.test.ts` | Create | AT-004 | (general) | 38 |
| 48 | `tests/worker/parser.test.ts` | Create | Extração sobre HTML fixture | (general) | 40 |
| 49 | `tests/worker/sync.test.ts` | Create | AT-005, AT-007 | (general) | 41 |
| 50 | `tests/lib/offlineBuffer.test.ts` | Create | AT-009 | (general) | 25 |
| 51 | `tests/api/visitas.test.ts` | Create | Contratos HTTP e autorização por token | (general) | 33, 34, 35 |
| 52 | `tests/fixtures/vendpago-estoque.html` | Create | HTML real capturado para o parser | (general) | None |
| 53 | `src/app/api/cron/sync/route.ts` | Create (Decision 7) | Endpoint HTTP protegido por `CRON_SECRET` que aciona `executarSincronizacao`; substitui o item 42 | (general) | 41, 9 |
| 54 | `.github/workflows/sync-cron.yml` | Create (Decision 7) | Aciona o item 53 três vezes ao dia (AT-005), independente do plano Vercel | (general) | 53 |
| 55 | `vercel.json` | Create (Decision 7) | Cron nativo do Vercel como caminho alternativo (1x/dia no plano Hobby); mantém a rota documentada mesmo se o time migrar de plano | (general) | 53 |
| 56 | `src/app/api/setup/migrate/route.ts` | Create (Decision 7) | Bootstrap do schema via GET protegido por `CRON_SECRET` na query string — permite aplicar o `schema.sql` no Turso a partir do navegador, sem terminal/CLI local | (general) | 14, 9 |

**Total Files:** 56 (52 originais − 1 removido + 4 adicionados pela Decision 7)

### Impacto retroativo da Decision 7 no manifesto original

A troca de `better-sqlite3` (síncrono) por `@libsql/client` (assíncrono) exigiu revisar a implementação — não o propósito — dos itens 13, 14, 19–23, 24, 33–37, 27, 29–32, 41, 44–46, 49, 51 (toda a cadeia que toca o banco passou a usar `Promise`/`await`). Nenhum contrato de domínio (itens 15–18) mudou.

### Agent Assignment Rationale

| Agent / Owner | Files Assigned | Why |
|---|---|---|
| (general) | 1–52 | Não há catálogo de agentes especializados disponível neste contexto |

**Agent Discovery:** Not available

---

## Code Patterns

### Pattern 1: ReadOnly Guard do Playwright

```typescript
import type {
  BrowserContext,
} from "playwright";

export class WriteAttemptError extends Error {
  constructor(method: string, url: string) {
    super("Tentativa de escrita bloqueada: " + method + " " + url);
    this.name = "WriteAttemptError";
  }
}

export async function applyReadOnlyGuard(
  context: BrowserContext,
  erpHost: string,
): Promise<void> {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isErp = url.host === erpHost;
    const isRead = request.method() === "GET";

    if (isErp && !isRead) {
      await route.abort("blockedbyclient");
      throw new WriteAttemptError(request.method(), request.url());
    }
    await route.continue();
  });
}
```

### Pattern 2: Geração determinística do roteiro

```typescript
import type {
  Mola,
  RoteiroLinha,
  VisitaItem,
} from "@/domain/types";

const ordenacaoNumerica: Intl.CollatorOptions = {
  numeric: true,
};

export function gerarRoteiro(
  itens: readonly VisitaItem[],
  molas: readonly Mola[],
): RoteiroLinha[] {
  const porPosicao = new Map(molas.map((m) => [m.id, m]));

  return itens
    .filter((item) => item.quantidadeInserida > 0 || item.produtoNovoId !== null)
    .map((item) => {
      const mola = porPosicao.get(item.molaId);
      if (!mola) throw new Error("Mola ausente no planograma: " + item.molaId);
      return {
        posicao: mola.posicao,
        produtoCodigo: item.produtoNovoId ?? mola.produtoAtualId,
        quantidade: item.quantidadeInserida,
        houveTroca: item.produtoNovoId !== null,
      };
    })
    .sort((a, b) =>
      a.posicao.localeCompare(b.posicao, "pt-BR", ordenacaoNumerica),
    );
}
```

### Pattern 3: Registro idempotente de item de visita

```typescript
export function upsertItem(db: Database, input: UpsertItemInput): void {
  db.prepare(
    `INSERT INTO visita_itens (visita_id, mola_id, quantidade_inserida, produto_novo_id)
     VALUES (@visitaId, @molaId, @quantidadeInserida, @produtoNovoId)
     ON CONFLICT (visita_id, mola_id) DO UPDATE SET
       quantidade_inserida = excluded.quantidade_inserida,
       produto_novo_id     = excluded.produto_novo_id`,
  ).run(input);
}
```

### Pattern 4: Configuração sem segredo em código

```typescript
function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error("Variável de ambiente obrigatória ausente: " + key);
  return value;
}

export const config = {
  databasePath: process.env.DATABASE_PATH ?? "./data/app.db",
  erpHost: process.env.VENDPAGO_HOST ?? "www.erpvending.com.br",
  erpUser: required("VENDPAGO_USER"),
  erpPasswordEnc: required("VENDPAGO_PASSWORD_ENC"),
  encryptionKey: required("ENCRYPTION_KEY"),
  syncCron: process.env.SYNC_CRON ?? "0 7,13,20 * * *",
  playwrightTimeoutMs: Number(process.env.PLAYWRIGHT_TIMEOUT_MS ?? 45000),
} as const;
```

---

## Data Flow

```text
1. Operador cadastra produtos e planograma no /admin
   │
   ▼
2. Operador gera link secreto por dispositivo; hash gravado em dispositivos
   │
   ▼
3. Abastecedor abre /v/[token] na máquina; token validado; visita criada (status=aberta)
   │
   ▼
4. Toque na mola → item gravado via POST idempotente; falha de rede desvia para IndexedDB
   │
   ▼
5. Troca de produto → item recebe produto_novo_id; planograma não muda ainda
   │
   ▼
6. Fechar visita → status=fechada; gerarRoteiro() produz linhas ordenadas;
   planograma atualizado para os produtos trocados
   │
   ▼
7. Operador abre /roteiro/[id], digita no VendPago e marca status=digitada
   │
   ▼
8. Em paralelo, worker dispara 3x ao dia: Playwright + ReadOnly Guard → parser →
   snapshot persistido (status=ok) ou falha registrada sem descartar o anterior
   │
   ▼
9. /admin exibe, por mola: quantidade do snapshot, pendência das visitas fechadas
   e não digitadas, e idade da última sincronização bem-sucedida
```

---

## Integration Points

| External System | Integration Type | Authentication | Direction | Failure / Retry |
|---|---|---|---|---|
| ERP VendPago (`erpvending.com.br`) | Automação de navegador (Playwright/Chromium), somente GET | Usuário e senha cifrados em variável de ambiente, decifrados em memória | Inbound (leitura) | 2 tentativas com backoff exponencial; após falha, snapshot anterior preservado e falha registrada; nenhuma retentativa de escrita existe porque escrita é bloqueada pelo guard |

---

## Testing Strategy

| Test Type | Scope / Requirement | Files | Tools | Pass Signal |
|---|---|---|---|---|
| Unit | AT-001, AT-002, AT-008 — roteiro contém só molas alteradas, ordenado, com troca identificada | `tests/domain/roteiro.test.ts` | Vitest | exit 0 |
| Unit | AT-003 — visão de estoque separa snapshot de pendência | `tests/domain/estoque.test.ts` | Vitest | exit 0 |
| Unit | Transições de estado e idempotência do upsert de itens | `tests/domain/visita.test.ts` | Vitest | exit 0 |
| Unit | AT-004 — guard aborta POST/PUT/DELETE ao host do ERP e permite GET | `tests/worker/readOnlyGuard.test.ts` | Vitest com contexto Playwright mockado | exit 0 |
| Unit | Parser extrai mola, produto e quantidade de HTML real | `tests/worker/parser.test.ts` + fixture | Vitest | exit 0 |
| Integration | AT-005, AT-007 — agenda 3x ao dia; falha preserva último snapshot e data da última sincronização | `tests/worker/sync.test.ts` | Vitest com fake timers e SQLite em memória | exit 0 |
| Integration | AT-009 — buffer offline preserva itens e reenvia ao restabelecer conexão | `tests/lib/offlineBuffer.test.ts` | Vitest com IndexedDB fake | exit 0 |
| Integration | Autorização: token inválido ou revogado recebe 401; token válido não acessa `/admin` | `tests/api/visitas.test.ts` | Vitest | exit 0 |
| E2E / Verify Gate | Suíte completa do DEFINE | Todos acima | `npm test` (Vitest) | exit 0 |
| Manual | AT-006 — visita completa registrada em até 120 segundos | N/A | Cronômetro em campo, uma visita real | Tempo medido ≤ 120s |

---

## Error Handling

| Error Type | Detection | Handling Strategy | Retry? | Observability |
|---|---|---|---|---|
| Token de dispositivo inválido ou revogado | Hash não encontrado ou `ativo=0` | 401 sem detalhar o motivo | No | Log `auth.device.denied` com prefixo do token |
| Quantidade inválida (negativa ou acima da capacidade) | Validação no domínio | 422 com a capacidade da mola na mensagem | No | Log `visita.item.invalid` |
| Item enviado para visita já fechada | Estado da visita | 409, item descartado | No | Log `visita.item.conflito` |
| Reenvio duplicado do buffer offline | Conflito na chave (visita, mola) | Upsert sobrescreve; resultado idêntico | N/A | Métrica `offline.reenvio` |
| Queda de rede durante o registro | Falha do fetch no cliente | Item vai para IndexedDB; UI marca pendente e reenvia | Yes | Métrica `offline.fila.tamanho` |
| Login no VendPago falha (senha, 2FA, captcha) | Ausência do seletor pós-login dentro do timeout | Aborta a sincronização; snapshot anterior mantido | Yes, 2x | Log `sync.login.falha` + métrica |
| Timeout do Playwright | Timeout configurável (padrão 45s) | Aborta e registra falha | Yes, 2x | Log `sync.timeout` |
| Estrutura da página mudou (parser vazio ou parcial) | Zero linhas ou colunas ausentes | Descarta o resultado; não grava snapshot degradado | No | Log `sync.parser.incompatível` com hash do HTML |
| Tentativa de escrita no ERP | `WriteAttemptError` do guard | Encerra a sincronização imediatamente | No | Log `erp.escrita.bloqueada` em nível error |
| Falha de escrita no SQLite | Exceção do driver | Transação revertida; 500 | No | Log `db.falha` |

---

## Configuration

| Config Key | Type | Source / Default | Sensitive? | Description |
|---|---|---|---|---|
| `DATABASE_URL` | string | env / `:memory:` (dev/test) | No | URL do libSQL: `libsql://<db>.turso.io` em produção, `file:./data/app.db` em VPS/self-host, `:memory:` em teste (Decision 7) |
| `DATABASE_AUTH_TOKEN` | string | env, obrigatório em produção com Turso | Yes | Token de autenticação do banco Turso (Decision 7) |
| `CRON_SECRET` | string | env, obrigatório | Yes | Segredo que autoriza `POST /api/cron/sync`; comparado ao header `Authorization: Bearer <CRON_SECRET>` (Decision 7) |
| `VENDPAGO_HOST` | string | env / `www.erpvending.com.br` | No | Host autorizado no ReadOnly Guard |
| `VENDPAGO_USER` | string | env, obrigatório | Yes | Usuário de leitura no ERP |
| `VENDPAGO_PASSWORD_ENC` | string | env, obrigatório | Yes | Senha cifrada em AES-256-GCM |
| `ENCRYPTION_KEY` | string | env, obrigatório | Yes | Chave de decifragem da credencial |
| `ADMIN_PASSWORD_HASH` | string | env, obrigatório | Yes | Hash `scrypt` da senha de administração (Argon2 revisto na Decision 7 — binário nativo incompatível com o runtime serverless da Vercel) |
| `SESSION_SECRET` | string | env, obrigatório | Yes | Assinatura do cookie de sessão |
| `PLAYWRIGHT_TIMEOUT_MS` | number | env / `45000` | No | Timeout de navegação |
| `LOG_LEVEL` | string | env / `info` | No | Nível de log estruturado |

> `SYNC_CRON` (agendamento node-cron) foi removido — o agendamento 3x/dia passou a ser externo (GitHub Actions / Vercel Cron), ver Decision 7.

---

## Security Considerations

- Token de dispositivo trafega na URL e vaza por histórico, print ou compartilhamento. Mitigação: 32 bytes aleatórios, armazenamento apenas do hash SHA-256, escopo limitado a abrir/registrar/fechar visita de uma máquina, revogação individual e trilha de qual dispositivo originou cada visita. O token nunca dá acesso a `/admin` nem ao histórico de estoque.
- A credencial do VendPago dá acesso à conta inteira, incluindo coleta financeira. Mitigação: cifrada em repouso com AES-256-GCM, decifrada apenas em memória no worker, nunca registrada em log, e ausente do processo web — apenas o worker a lê.
- O ReadOnly Guard é a fronteira de menor privilégio contra o ERP e é coberto por teste automatizado. Sua remoção deve ser tratada como mudança de segurança, não como refactor.
- Área administrativa protegida por cookie assinado, httpOnly, SameSite=Lax, com hash `scrypt` da senha (nativo do Node — ver Decision 7 sobre a troca do Argon2). Sem essa sessão, cadastro e estoque são inacessíveis.
- Validação de entrada no domínio antes da persistência: quantidade inteira não negativa e limitada à capacidade da mola; produto restrito a IDs existentes na lista fixa.
- Nenhum dado pessoal é tratado pelo sistema; os registros são operacionais (molas, produtos, quantidades).
- Segredos vivem exclusivamente em variáveis de ambiente. O `.env.example` documenta as chaves sem valores reais.

---

## Observability

| Aspect | Implementation | Signal / Why |
|---|---|---|
| Logging | Log estruturado JSON com nível e ID de correlação por visita e por execução de sincronização | Diagnostica falha de login, incompatibilidade do parser e tentativa de escrita bloqueada |
| Metrics | Contadores em tabela `metricas`: sincronizações ok/falha, idade do último snapshot, visitas fechadas não digitadas, tamanho da fila offline | Idade do snapshot e pendência de digitação são exatamente os Success Criteria; ficam visíveis no `/admin` |
| Tracing | N/A | Dois processos e um fluxo linear não justificam tracing distribuído |

---

## Requirements Traceability

| Requirement / AT | Design Element | Test / Gate |
|---|---|---|
| MUST registrar quantidades por toque | Planogram UI, `api/visitas/[id]/itens` | `tests/api/visitas.test.ts` |
| MUST registrar troca por lista fixa | Domain Visita, `produtos` repo | `tests/domain/roteiro.test.ts` |
| MUST gerar roteiro ordenado | Decision 5, `src/domain/roteiro.ts` | `tests/domain/roteiro.test.ts` |
| MUST ler o ERP somente em leitura | Decision 2, ReadOnly Guard | `tests/worker/readOnlyGuard.test.ts` |
| MUST exibir estoque e pendência | `src/domain/estoque.ts`, `/admin` | `tests/domain/estoque.test.ts` |
| SHOULD preservar registro offline | Offline Buffer | `tests/lib/offlineBuffer.test.ts` |
| SHOULD exibir idade da sincronização | Snapshots repo, `/admin` | `tests/worker/sync.test.ts` |
| COULD marcar item como lançado | `api/visitas/[id]/digitada` | `tests/api/visitas.test.ts` |
| AT-001 | `gerarRoteiro` | `tests/domain/roteiro.test.ts` |
| AT-002 | `produtoNovoId` e flag `houveTroca` | `tests/domain/roteiro.test.ts` |
| AT-003 | `src/domain/estoque.ts` | `tests/domain/estoque.test.ts` |
| AT-004 | ReadOnly Guard | `tests/worker/readOnlyGuard.test.ts` |
| AT-005 | `src/worker/index.ts`, `SYNC_CRON` | `tests/worker/sync.test.ts` |
| AT-006 | Planogram UI de toque | Checklist manual, cronômetro em campo |
| AT-007 | `src/worker/sync.ts`, snapshots repo | `tests/worker/sync.test.ts` |
| AT-008 | Filtro em `gerarRoteiro` | `tests/domain/roteiro.test.ts` |
| AT-009 | Offline Buffer, upsert idempotente | `tests/lib/offlineBuffer.test.ts` |
| Verify Gate | Suíte Vitest | `npm test` → exit 0 |

---

## Risks and Mitigations

| Risk | Impact | Mitigation | Residual Risk |
|---|---|---|---|
| Login do VendPago exige 2FA ou captcha (A-001) | O robô torna-se inviável e um MUST cai | Isolar o scraper atrás de `src/worker/`; o app e o roteiro funcionam sem ele | Perda da visão de estoque; roteiro permanece funcional |
| Termos de uso proíbem acesso automatizado (A-002) | Risco de suspensão da conta que opera a máquina | Verificar antes do Build; leitura em baixa frequência (3x/dia) e sem paralelismo | Risco contratual não eliminado por medida técnica |
| Mudança de layout do VendPago (A-003) | Parser retorna vazio ou parcial | Parser rejeita resultado incompatível em vez de gravar snapshot degradado; fixture de HTML real nos testes | Manutenção recorrente do seletor |
| Vazamento do link secreto | Terceiro registra visitas falsas | Escopo restrito, revogação por dispositivo, trilha de origem | Dados operacionais poluídos até a revogação |
| Erro de toque do abastecedor | Roteiro correto quanto ao registro, errado quanto à realidade | Confirmação visual no fechamento da visita | Sem recontagem no v1, por decisão de YAGNI |
| Divergência de nomenclatura entre planograma e ERP | Operador precisa traduzir e o retrabalho retorna | Semear o cadastro a partir do export real do VendPago | Depende de amostra ainda não anexada |

---

## Advisor Ledger

None — no formal external design review.

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-09-08 | SDD Design by RDD | Initial version |

---

## Next Step

Execute o **SDD Build by RDD**.
