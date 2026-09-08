/**
 * DDL embutido como string TS (não lido de um .sql em runtime): funções
 * serverless da Vercel só empacotam o que é importado como módulo — um
 * `readFileSync` de um `.sql` solto falha com ENOENT no runtime (Decision 7).
 */
export const schemaSql = `
CREATE TABLE IF NOT EXISTS produtos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
);

CREATE TABLE IF NOT EXISTS molas (
  id TEXT PRIMARY KEY,
  posicao TEXT NOT NULL UNIQUE,
  produto_atual_id TEXT NOT NULL REFERENCES produtos (id),
  capacidade INTEGER NOT NULL CHECK (capacidade > 0)
);

CREATE TABLE IF NOT EXISTS dispositivos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visitas (
  id TEXT PRIMARY KEY,
  dispositivo_id TEXT NOT NULL REFERENCES dispositivos (id),
  status TEXT NOT NULL CHECK (status IN ('aberta', 'fechada', 'digitada')) DEFAULT 'aberta',
  aberta_em TEXT NOT NULL,
  fechada_em TEXT,
  digitada_em TEXT
);

CREATE INDEX IF NOT EXISTS idx_visitas_dispositivo ON visitas (dispositivo_id);
CREATE INDEX IF NOT EXISTS idx_visitas_status ON visitas (status);

CREATE TABLE IF NOT EXISTS visita_itens (
  visita_id TEXT NOT NULL REFERENCES visitas (id),
  mola_id TEXT NOT NULL REFERENCES molas (id),
  quantidade_inserida INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_inserida >= 0),
  produto_novo_id TEXT REFERENCES produtos (id),
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (visita_id, mola_id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ok', 'falha')),
  criado_em TEXT NOT NULL,
  erro TEXT
);

CREATE INDEX IF NOT EXISTS idx_snapshots_status_criado ON snapshots (status, criado_em);

CREATE TABLE IF NOT EXISTS snapshot_itens (
  snapshot_id TEXT NOT NULL REFERENCES snapshots (id),
  mola_codigo TEXT NOT NULL,
  produto_codigo TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade >= 0),
  PRIMARY KEY (snapshot_id, mola_codigo)
);
`;
