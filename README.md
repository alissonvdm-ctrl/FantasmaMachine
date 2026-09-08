# Reposição Vending

Sistema web para registrar, em campo e por toque, a reposição de molas de uma vending machine, gerar um roteiro de digitação para o ERP VendPago e exibir o estoque lido do ERP por um robô de leitura agendado.

Ver `DEFINE_REPOSICAO_VENDING.md` e `DESIGN_REPOSICAO_VENDING.md` para requisitos e arquitetura completos.

## Requisitos

- Node.js 22+
- Dependências do Chromium (para o Playwright), já incluídas na imagem Docker

## Configuração

```bash
cp .env.example .env
# preencha VENDPAGO_USER, VENDPAGO_PASSWORD_ENC, ENCRYPTION_KEY,
# ADMIN_PASSWORD_HASH e SESSION_SECRET
npm install
npm run migrate
```

A `VENDPAGO_PASSWORD_ENC` é gerada cifrando a senha real com `ENCRYPTION_KEY` (AES-256-GCM) — nunca armazene a senha em texto puro. Use `src/lib/crypto.ts` (`encrypt`) para gerar o valor uma única vez, fora do repositório.

## Rodando localmente

```bash
npm run dev      # aplicação web (Next.js)
npm run worker   # processo separado do robô de leitura (cron 3x/dia)
```

## Testes (Verify Gate)

```bash
npm test
```

## Deploy

```bash
docker compose up -d --build
```

O app e o worker compartilham o mesmo volume `data`, onde vive o arquivo SQLite (`DATABASE_PATH`).

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

O banco é um único arquivo SQLite (`DATABASE_PATH`, padrão `./data/app.db`) em modo WAL. Para um backup consistente, pare a escrita (ou use `VACUUM INTO`) e copie o arquivo — junto dos arquivos `-wal` e `-shm`, se presentes e não consolidados.

### Sincronização com o VendPago

O worker roda em processo separado (`npm run worker`), agendado por `SYNC_CRON` (padrão: 3x ao dia). Ele só executa leitura — o `ReadOnly Guard` aborta qualquer requisição não-GET dirigida ao domínio do VendPago (`VENDPAGO_HOST`) e falha a sincronização. Uma falha de sincronização preserva o último snapshot válido; a idade dessa sincronização aparece em `/admin`.
