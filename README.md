# Reposição Vending

Sistema web para registrar, em campo e por toque, a reposição de molas de uma vending machine, gerar um roteiro de digitação para o ERP VendPago e exibir o estoque lido do ERP por um robô de leitura agendado.

Ver `DEFINE_REPOSICAO_VENDING.md` e `DESIGN_REPOSICAO_VENDING.md` (Decision 7) para requisitos e arquitetura completos.

## Requisitos

- Node.js 22+
- Um banco libSQL — [Turso](https://turso.tech) em produção, ou um arquivo local em dev (nada extra a instalar)

## Configuração

```bash
cp .env.example .env
# preencha VENDPAGO_USER, VENDPAGO_PASSWORD_ENC, ENCRYPTION_KEY,
# ADMIN_PASSWORD_HASH, SESSION_SECRET e CRON_SECRET
npm install
npm run migrate
```

A `VENDPAGO_PASSWORD_ENC` é gerada cifrando a senha real com `ENCRYPTION_KEY` (AES-256-GCM) — nunca armazene a senha em texto puro. Use `src/lib/crypto.ts` (`encrypt`) para gerar o valor uma única vez, fora do repositório.

## Rodando localmente

```bash
npm run dev      # aplicação web (Next.js); DATABASE_URL padrão é file:./data/app.db
```

Não há mais um processo de worker separado — ver "Sincronização com o VendPago" abaixo.

## Testes (Verify Gate)

```bash
npm test
```

## Deploy

### Vercel + Turso (recomendado)

1. Crie um banco no Turso (`turso db create reposicao-vending`) e obtenha `DATABASE_URL` (`turso db show --url`) e `DATABASE_AUTH_TOKEN` (`turso db tokens create`).
2. No projeto Vercel, configure as variáveis de ambiente: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `VENDPAGO_USER`, `VENDPAGO_PASSWORD_ENC`, `ENCRYPTION_KEY`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `CRON_SECRET`.
3. Rode `npm run migrate` uma vez apontando `DATABASE_URL`/`DATABASE_AUTH_TOKEN` para o banco do Turso (localmente, antes do primeiro deploy).
4. Faça o deploy (push para a branch de produção, ou `vercel deploy --prod`).
5. Configure o agendamento 3x/dia da sincronização (AT-005) — ver "Sincronização com o VendPago" abaixo; o plano Hobby da Vercel só permite Cron nativo 1x/dia.

### Docker / VPS (alternativa self-hosted)

```bash
docker compose up -d --build
```

O `app` roda sozinho (sem processo de worker separado — ver abaixo). `DATABASE_URL` pode continuar apontando para um arquivo local (`file:./data/app.db`) ou para o Turso.

## Operação

### Cadastro inicial

1. Acesse `/admin` e autentique com a senha de administração.
2. Cadastre a lista fixa de produtos em `/admin/produtos`.
3. Cadastre o planograma (molas, posições, capacidades, produto atual) em `/admin/planograma`, espelhando a nomenclatura do VendPago.

### Gerar um link secreto para um abastecedor

Um link de dispositivo é criado via `src/repos/dispositivos.ts` (`criarDispositivo`), que devolve o token em texto puro uma única vez — apenas o hash SHA-256 fica armazenado. Distribua a URL `/v/<token>` para o celular do abastecedor. O token só permite abrir, registrar itens e fechar uma visita; nunca dá acesso a `/admin`.

### Revogar um dispositivo

Marque o dispositivo como inativo (`ativo=0`) via `src/repos/dispositivos.ts` (`revogarDispositivo`). Requisições subsequentes com aquele token recebem 401 imediatamente.

### Backup

Em produção, o backup é responsabilidade do Turso (snapshots do próprio serviço). Em modo arquivo local (`file:./data/app.db`, dev/VPS), copie o arquivo — junto dos arquivos `-wal` e `-shm`, se presentes e não consolidados.

### Sincronização com o VendPago

Não há mais um processo `node-cron` de vida longa (incompatível com serverless) — a sincronização é `POST /api/cron/sync`, protegida pelo header `Authorization: Bearer $CRON_SECRET`. Ela só executa leitura — o `ReadOnly Guard` aborta qualquer requisição não-GET dirigida ao domínio do VendPago (`VENDPAGO_HOST`) e falha a sincronização. Uma falha preserva o último snapshot válido; a idade dessa sincronização aparece em `/admin`.

Para cumprir as 3 sincronizações diárias (AT-005) independentemente do plano da Vercel, use o workflow já incluído em `.github/workflows/sync-cron.yml`: configure os secrets do repositório GitHub `SYNC_URL` (URL de produção) e `CRON_SECRET` (mesmo valor da env var na Vercel). Alternativamente, em VPS/Docker, agende o mesmo `curl` no crontab do host. O `vercel.json` também registra um Cron nativo 1x/dia como caminho redundante caso o time migre para o plano Pro.
