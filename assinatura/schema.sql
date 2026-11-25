-- Banco do servidor de assinatura (Cloudflare D1 "vpx-assinatura").
-- Referência: docs/assinatura-contratos.md. Aplicar no remoto com:
--   npx wrangler d1 execute vpx-assinatura --remote --file schema.sql
-- (o configurar.mjs faz isso). No modo de teste o próprio servidor cria as tabelas.

CREATE TABLE envelopes (
  id TEXT PRIMARY KEY,              -- 16 caracteres aleatórios (base32 minúsculo)
  codigo TEXT UNIQUE NOT NULL,      -- código público de verificação: "K7QH-3MZD-P2XA" (base32 sem I, O, 0, 1)
  titulo TEXT NOT NULL,
  cliente TEXT,                     -- nome da pasta do cliente no OneDrive
  criador_email TEXT NOT NULL,
  criador_nome TEXT,
  mensagem TEXT,
  em_ordem INTEGER NOT NULL DEFAULT 0,   -- 1 = assinam em ordem
  prazo TEXT,                       -- AAAA-MM-DD (vale até 23:59 de Brasília)
  lembretes INTEGER NOT NULL DEFAULT 1,  -- 1 = lembrete a cada 3 dias
  status TEXT NOT NULL,             -- rascunho | aguardando | concluido | recusado | cancelado | expirado
  hash_original TEXT NOT NULL,      -- SHA-256 (hex minúsculo) calculado pelo app
  paginas INTEGER,
  tamanho INTEGER,
  pdf_ok INTEGER NOT NULL DEFAULT 0,
  hash_final TEXT,
  final_dl TEXT,                    -- SHA-256 do token de download do PDF final
  criado_em TEXT NOT NULL,          -- ISO 8601 UTC (hora do servidor)
  atualizado_em TEXT NOT NULL,
  enviado_em TEXT,
  concluido_em TEXT,
  arquivado_em TEXT,                -- o app guardou o PDF final no OneDrive
  pdfs_apagados_em TEXT,
  motivo TEXT,                      -- motivo do cancelamento ou da recusa
  meta TEXT                         -- JSON livre do app: { oport, orc, modelo, ... }
);
CREATE TABLE signatarios (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  cpf TEXT,                         -- opcional: se preenchido, quem assina tem de informar este CPF
  papel TEXT NOT NULL,              -- contratante | contratada | testemunha
  modo TEXT NOT NULL,               -- link (código por e-mail) | app (pessoa da VPX, assina dentro do app com a conta Microsoft)
  token_hash TEXT UNIQUE,           -- SHA-256 do token do link (só modo link)
  token_cifrado TEXT,               -- token cifrado com CHAVE_LINKS (AES-GCM), para o app copiar o link de novo
  status TEXT NOT NULL,             -- pendente | assinado | recusado
  visto_em TEXT, identificado_em TEXT, assinado_em TEXT,
  metodo TEXT,                      -- codigo-email | microsoft
  nome_assinado TEXT, cpf_assinado TEXT,
  ip TEXT, aparelho TEXT, local TEXT, -- local = cidade/estado/país do request.cf (aproximado)
  geo TEXT,                         -- JSON {lat, lon, precisao} se a pessoa permitir no navegador
  imagem TEXT,                      -- PNG em data URL (até 200 KB)
  recusa_motivo TEXT,
  notificado_em TEXT, lembrado_em TEXT
);
CREATE TABLE eventos (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  envelope_id TEXT NOT NULL,
  signatario_id TEXT,
  tipo TEXT NOT NULL,               -- criado | enviado | email_enviado | email_falhou | visualizou | codigo_enviado | identificou | codigo_errado | abriu_documento | assinou | recibo_enviado | recusou | lembrete | concluido | cancelado | aviso_cancelamento | expirado | final_gravado | email_final | arquivado | baixou_final
  quando TEXT NOT NULL,
  ip TEXT, aparelho TEXT,
  local TEXT,                       -- cidade/estado/país do request.cf (aproximado)
  detalhe TEXT,                     -- texto curto
  anterior TEXT,                    -- hash do evento anterior (no 1º: a base, que liga a trilha ao contrato e ao documento original)
  hash TEXT NOT NULL                -- SHA-256( anterior + "|" + JSON.stringify([envelope_id, tipo, quando, signatario_id, ip, aparelho, local, detalhe]) ), vazios = "" — trilha encadeada (versão 2)
);
CREATE TABLE codigos (signatario_id TEXT PRIMARY KEY, codigo_hash TEXT, expira TEXT, tentativas INTEGER NOT NULL DEFAULT 0, envios INTEGER NOT NULL DEFAULT 0, ultimo_envio TEXT, janela_inicio TEXT);
CREATE TABLE sessoes (sessao_hash TEXT PRIMARY KEY, signatario_id TEXT NOT NULL, expira TEXT NOT NULL);
-- quem cuida dos contratos (a função Contratos do app): o administrador manda a lista pelo app (PUT /api/gestores); os ADMINS do wrangler.toml valem sempre
CREATE TABLE gestores (email TEXT PRIMARY KEY, desde TEXT NOT NULL);

-- Índices (para as listas e a tarefa diária ficarem rápidas)
CREATE INDEX idx_env_atualizado ON envelopes (atualizado_em);
CREATE INDEX idx_env_status ON envelopes (status);
CREATE INDEX idx_env_final_dl ON envelopes (final_dl);
CREATE INDEX idx_sig_envelope ON signatarios (envelope_id, ordem);
CREATE INDEX idx_sig_email ON signatarios (email);
CREATE INDEX idx_evt_envelope ON eventos (envelope_id, seq);
CREATE UNIQUE INDEX idx_evt_anterior ON eventos (envelope_id, anterior);   -- dois eventos não podem seguir o mesmo anterior (a cadeia não bifurca)
CREATE INDEX idx_sessoes_sig ON sessoes (signatario_id);
