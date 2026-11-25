# Assinatura de contratos — plano técnico

Pedido do Gustavo em 24/11/2026: "sistema de assinatura de contratos semelhante ao Autentique". Decisões dele:

- **link remoto próprio já**: o cliente assina à distância, por um link, como no Autentique;
- **o contrato vem de um PDF pronto ou de um modelo preenchido pelo app** (os dois);
- **quem assina**: cliente + VPX + até 2 testemunhas opcionais.

Este arquivo é a referência para as três partes: o **servidor de assinatura** (pasta `assinatura/`), o **módulo Contratos do app** (`index.html`) e os **modelos de contrato** (no OneDrive).

## Por que um servidor

O cliente não tem login da Microsoft da VPX, e a Graph não deixa ler nem gravar no OneDrive sem login (`/shares` sempre exige autenticação no OneDrive for Business). Por isso há um pequeno servidor grátis na **Cloudflare (Workers + D1 + KV)**, que funciona como "cartório e caixa postal":

- guarda o PDF e o pedido de assinatura;
- manda os e-mails (link e código de verificação) pela **Resend**;
- serve a página pública de assinatura e a de verificação;
- registra cada passo com hora, IP e aparelho **do servidor**.

**Quem grava no OneDrive é sempre o app**, com o login de quem está nele. O servidor não tem nenhuma credencial da Microsoft e não precisa de permissão nova no Entra: ele só confere o `id_token` do login (assinado pela Microsoft) para saber que o pedido vem de alguém da VPX.

## Partes e arquivos

| Parte | Onde | O quê |
|---|---|---|
| Servidor | `assinatura/` (`wrangler.toml`, `src/worker.js`, `src/pagina-assinar.html`, `src/pagina-verificar.html`, `schema.sql`, `test/`) | API, páginas públicas, e-mails, tarefas diárias |
| App | `index.html` (módulo Contratos) | criar, enviar, acompanhar, assinar pela VPX, montar o PDF final, guardar no OneDrive |
| Modelos | OneDrive: `VPX Visitas - Configuração/contratos-modelos.json` | texto dos contratos-padrão (privado: não vai para o GitHub) |

`assinatura/node_modules` e `assinatura/.wrangler` ficam fora do git (`.gitignore`). O código do servidor pode ser público: **nenhum segredo vai no código** (os segredos ficam com `wrangler secret put`).

## Servidor (Cloudflare Worker `vpx-assinatura`)

### Ligações (wrangler.toml)

- `DB` → banco D1 `vpx-assinatura`
- `PDFS` → espaço KV (guarda os PDFs: `orig:<id>` e `final:<id>`; até 25 MB cada)
- Variáveis: `TENANT_ID`, `CLIENT_ID` (os mesmos do `CONFIG` do app), `APP_ORIGENS` (origens que podem chamar a API pelo navegador: `https://vpxengenharia.github.io`; em teste também `http://localhost:5510`), `REMETENTE` (`VPX Engenharia <assinaturas@vpxengenharia.com.br>`), `URL_PUBLICA` (endereço do próprio Worker, sem barra no fim; vale também para o QR e o rodapé da via final, pelo `url_verificacao`), `ADMINS` (e-mails, separados por vírgula, que mudam a lista de gestores e cancelam contratos de outras pessoas: hoje `gustavoponchio@vpxengenharia.com.br`).
- Segredos: `RESEND_KEY` (chave da Resend) e `CHAVE_LINKS` (32 bytes em base64, gerada uma vez; cifra os links guardados).
- `MODO_TESTE = "1"` **só** no `wrangler dev` (arquivo `.dev.vars`), nunca em produção. Em modo de teste: os e-mails não saem e ficam numa lista (`GET /api/teste/emails`), o código de verificação volta na resposta, o login aceita tokens assinados pela chave de teste (`JWKS_TESTE`) e a origem `http://localhost:5510` é aceita.
- Cron: `0 12 * * *` (todo dia às 9h de Brasília).

**Limite do plano grátis: 10 ms de CPU por pedido.** Por isso o servidor **não** abre nem calcula o hash de PDFs: o PDF entra e sai como fluxo (`request.body` direto para o KV), o hash SHA-256 é calculado no navegador (app e página de assinatura) e o PDF final é montado pelo app.

### Banco (schema.sql)

```sql
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
  ip TEXT, aparelho TEXT, local TEXT,
  detalhe TEXT,                     -- texto curto
  anterior TEXT,                    -- hash do evento anterior (no 1º: a base)
  hash TEXT NOT NULL                -- trilha encadeada, versão 2 (ver abaixo)
);
CREATE UNIQUE INDEX idx_evt_anterior ON eventos (envelope_id, anterior);   -- dois eventos não seguem o mesmo anterior: a cadeia não bifurca
CREATE TABLE gestores (email TEXT PRIMARY KEY, desde TEXT NOT NULL);         -- quem cuida dos contratos (o app manda a lista)
CREATE TABLE codigos (signatario_id TEXT PRIMARY KEY, codigo_hash TEXT, expira TEXT, tentativas INTEGER NOT NULL DEFAULT 0, envios INTEGER NOT NULL DEFAULT 0, ultimo_envio TEXT, janela_inicio TEXT);
CREATE TABLE sessoes (sessao_hash TEXT PRIMARY KEY, signatario_id TEXT NOT NULL, expira TEXT NOT NULL);
```

**Trilha encadeada (versão 2, revisão de 24/11/2026)**: `base = SHA-256("vpx-assinatura-v2|" + id + "|" + codigo + "|" + hash_original)` (liga a trilha a este contrato e ao documento); cada evento grava `anterior` (o hash do último evento do contrato, ou a base) e `hash = SHA-256(anterior + "|" + JSON.stringify([envelope_id, tipo, quando, signatario_id, ip, aparelho, local, detalhe]))`, com `""` nos vazios. A gravação é `INSERT … SELECT … WHERE` o último hash ainda é o `anterior` (mais o índice único): dois pedidos ao mesmo tempo não bifurcam a cadeia — o 2º relê e tenta de novo. O detalhe do `assinou` traz o método, o nome e o CPF (mascarado) informados, o SHA-256 do documento visto, o SHA-256 da imagem da assinatura, a versão e o SHA-256 do texto do aceite e a localização. Âncora fora do servidor: logo depois de assinar, cada pessoa recebe um **recibo por e-mail** com o hash do evento `assinou` dela e o do documento. `GET /api/envelopes/:id` devolve `cadeia: { versao, base, formula }`; a via final leva tudo isso anexado (`trilha-de-eventos.json`).

Tokens e códigos: sempre `crypto.getRandomValues`. Token do link: 32 bytes em base64url. Sessão: 32 bytes, vale 2 h. Código: 6 dígitos, vale 10 min, até 5 tentativas; até 5 envios por hora e 1 por minuto por signatário. No banco ficam só os hashes (SHA-256) de tokens, sessões e códigos.

### Login do app

Cabeçalho `Authorization: Bearer <id_token>` (o `idToken` que o MSAL devolve). O servidor confere:

- assinatura RS256 pelas chaves de `https://login.microsoftonline.com/<TENANT_ID>/discovery/v2.0/keys` (guardadas em memória por 6 h; uma chave desconhecida força buscar de novo);
- `aud == CLIENT_ID`, `tid == TENANT_ID`, `iss == https://login.microsoftonline.com/<TENANT_ID>/v2.0`;
- `exp` com folga de 5 min, `nbf`.

A pessoa = `preferred_username` (minúsculo) + `name`. **Só contas da VPX** (revisão de 24/11/2026): token com o claim `idp` (convidado — o cadastro da equipe de campo deixa qualquer pessoa virar convidada do tenant) ou e-mail fora de `@vpxengenharia.com.br` → 403. **Gestores** = os e-mails da tabela `gestores` (o administrador fixo do app manda, por `PUT /api/gestores`, quem tem a função `contratos` ou é administrador no `permissoes.json`) mais os `ADMINS` do `wrangler.toml` (variável; hoje só o Gustavo). Só gestor cria (até 40 por dia por pessoa), cancela (só o criador ou um ADMINS), reenvia e-mail, pega links, grava a via final e marca arquivado. Quem não é gestor vê só os contratos que criou ou em que assina pelo app (os outros: 404), e no detalhe sem os dados pessoais dos outros signatários.

CORS: só as origens de `APP_ORIGENS`, com `Authorization` e `Content-Type`, métodos GET/POST/PUT, `Access-Control-Max-Age: 86400`. As rotas públicas (`/assinar`, `/v/…`, `/api/s/…`, `/api/v/…`, `/api/f/…`) são usadas só pelas páginas servidas pelo próprio Worker (mesma origem).

### Rotas do app (com login)

Todas respondem JSON (`{ erro: "texto em português" }` com 4xx/5xx), menos as de PDF.

- `POST /api/envelopes` — cria um rascunho. Corpo: `{ titulo, cliente, mensagem, em_ordem, prazo, lembretes, hash_original, paginas, tamanho, meta, signatarios: [{ nome, email, telefone, cpf, papel, modo, ordem }] }`. Regras: 1 a 10 signatários; modo `link` exige e-mail válido; modo `app` exige e-mail da VPX (domínio `vpxengenharia.com.br`); CPF, se vier, com dígitos válidos; `hash_original` com 64 caracteres hex; tamanho até 20 MB. Resposta: `{ envelope }` (formato abaixo).
- `PUT /api/envelopes/:id/pdf` — corpo = os bytes do PDF (`Content-Type: application/pdf`); só no rascunho, só o criador; confere `Content-Length == tamanho`; grava no KV `orig:<id>` como fluxo; `pdf_ok = 1`.
- `POST /api/envelopes/:id/enviar` — só com `pdf_ok`; status `aguardando`; cria os tokens dos signatários `link`; manda o e-mail para todos (ou só para o primeiro, em ordem; quem é `app` e está na vez recebe e-mail avisando para assinar pelo app). Resposta: `{ envelope, links: { <signatario_id>: url } }`.
- `PUT /api/gestores` — `{ emails }`: troca a lista de quem cuida dos contratos (só `ADMINS`; só e-mails da VPX). `GET /api/gestores` devolve a lista.
- `GET /api/envelopes?desde=<ISO>&apos=<id>` — lista os envelopes com `atualizado_em >= desde` dos últimos 3 anos, **em páginas de 150** ordenadas por (atualizado_em, id): `mais = { desde, apos }` enquanto houver. Os signatários vêm **sem** imagem, CPF, IP, aparelho, local e localização (telefone só para gestores). Resposta: `{ envelopes, agora, mais, gestor }` (`agora` = hora do servidor no começo; o app pede a próxima com 5 min de folga).
- `GET /api/envelopes/:id` — tudo, com `imagem` de cada signatário e `eventos`.
- `GET /api/envelopes/:id/pdf` — o PDF original (`404` se já apagado).
- `GET /api/envelopes/:id/final` — o PDF final (`404` se não existe).
- `GET /api/envelopes/:id/link/:sid` — `{ url }` (decifra o token; só signatário `link` pendente e envelope `aguardando`).
- `POST /api/envelopes/:id/lembrar` — `{ sid? }`: manda de novo o e-mail para um signatário pendente (ou todos que estão na vez); no máximo 1 por signatário a cada 10 min.
- `POST /api/envelopes/:id/assinar-app` — `{ sid, nome, cpf, imagem, hash_visto, aceite: true, aceite_versao, geo? }`: o signatário `app` assina com a conta Microsoft. Exige `preferred_username == email` do signatário, a vez dele (em ordem) e `hash_visto == hash_original`.
- `POST /api/envelopes/:id/cancelar` — `{ motivo, soRascunho? }`; só envelopes `rascunho`/`aguardando` (com `soRascunho`, só `rascunho`: o app desfaz um envio que não terminou sem cancelar um que já saiu); avisa por e-mail quem já tinha sido chamado. A troca de situação é condicional (outra pessoa mudou no mesmo instante → 409).
- `PUT /api/envelopes/:id/final` — corpo = PDF final; cabeçalho `X-Hash-Final` (SHA-256 calculado pelo app). Só com status `concluido` e sem final ainda (senão `409`; quem recebe 409 baixa o final com `GET …/final`). Grava `final:<id>`, `hash_final`, cria o token de download e **manda a todos os signatários e ao criador o e-mail "Documento assinado por todos"**, com o link `URL_PUBLICA/api/f/<token>` (vale 30 dias), o código e o hash final.
- `POST /api/envelopes/:id/arquivado` — `{ caminho }`: o app gravou o final no OneDrive. Marca `arquivado_em` (só com `hash_final` gravado; o evento leva quem marcou).
- `GET /api/envelopes/:id/pdf` por quem assina pelo app e ainda não assinou registra `abriu_documento` e o `visto_em` (a hora real da leitura).

Formato do envelope nas respostas:

```json
{ "id", "codigo", "titulo", "cliente", "criador_email", "criador_nome", "mensagem", "em_ordem", "prazo", "lembretes",
  "status", "hash_original", "paginas", "tamanho", "pdf_ok", "hash_final", "criado_em", "atualizado_em", "enviado_em",
  "concluido_em", "arquivado_em", "motivo", "meta": {}, "url_verificacao",
  "signatarios": [{ "id", "ordem", "nome", "email", "telefone", "cpf", "papel", "modo", "status", "visto_em",
    "identificado_em", "assinado_em", "metodo", "nome_assinado", "cpf_assinado", "ip", "aparelho", "local", "geo",
    "recusa_motivo", "notificado_em", "imagem?" }],
  "eventos?": [{ "seq", "signatario_id", "tipo", "quando", "ip", "aparelho", "local", "detalhe", "anterior", "hash" }],
  "cadeia?": { "versao": 2, "base", "formula" } }
```

`url_verificacao` = `URL_PUBLICA/v/<código>`: o QR, o rodapé da via final e os e-mails usam sempre o mesmo endereço. Na lista, os signatários vêm só com os campos que não são dados pessoais (ver a rota).

### Página pública de assinatura

`GET /assinar` serve `pagina-assinar.html` (um arquivo só, HTML + CSS + JS, cores e letras da VPX: azul `#1C3C61`, laranja `#EB9D2B`, Barlow; funciona no celular com uma mão). O link é `URL_PUBLICA/assinar#t=<token>`: o token fica depois do `#` e não vai para registros nem para outros sites. CSP (revisão de 24/11/2026): `script-src` **sem `'unsafe-inline'`** — só o script da própria página, pelo SHA-256 dele (calculado pelo servidor uma vez por página), e a pasta do pdf.js 3.11.174 no jsDelivr, que a página carrega com `integrity` (SRI); `worker-src blob:` + a mesma pasta; `base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'`. `Referrer-Policy: no-referrer`.

Passos:

1. `POST /api/s/info { t }` → título, quem enviou, mensagem, prazo, situação, e-mail mascarado (`j***@gmail.com`), papel, se está na vez, outros signatários (nome, papel, situação), número de páginas, hash e o texto do aceite (`aceite: { versao, texto }`). Mostra uma explicação curta ("A VPX Engenharia enviou um documento para você assinar"). Registra `visualizou` (só a 1ª vez).
2. **Confirmar que é você**: botão "Enviar código para j***@gmail.com" → `POST /api/s/codigo { t }`; campo de 6 dígitos (aceita o código colado com espaços) → `POST /api/s/verificar { t, codigo }` → `{ sessao, expira }`. A hora em que o código foi pedido e a sessão ficam no `sessionStorage` da aba: recarregar a página (ou voltar do app de e-mail) mostra o campo do código de novo, ou vai direto para o documento. Se o servidor responde 429 ao pedir o código (já pedido há menos de 1 minuto, talvez noutra aba), o campo aparece mesmo assim. Tentativas e limite de envios são conferidos e gastos num comando só (pedidos ao mesmo tempo não passam do limite).
3. **Ler o documento**: `POST /api/s/pdf { t, sessao }` → bytes (registra `abriu_documento`, com o SHA-256 entregue); a página calcula o SHA-256 (`crypto.subtle`) e desenha as páginas com o pdf.js — **só as perto da tela** (caixas do tamanho de cada página, `IntersectionObserver`; as que se afastam são apagadas: documentos longos com zoom não estouram a memória do iPhone). O + e o − mantêm o ponto que a pessoa lia; mudar só a altura da janela (barra do Safari, teclado) não redesenha. Mostra o código do documento e o hash. O passo 3 aparece assim que o hash confere.
4. **Assinar**: nome completo (vem preenchido; só letras que a folha de assinaturas imprime — Latin-1), CPF (conferido pelos dígitos; se o signatário tem CPF definido, tem de ser igual), assinatura com o dedo (mesma regra do app: só vale com 120 px riscados e 40 px de largura; ou "Usar meu nome digitado"; girar a tela mantém o desenho sem esticar), caixa do aceite e, opcional, "Registrar minha localização". `POST /api/s/assinar { t, sessao, nome, cpf, imagem, hash_visto, aceite: true, aceite_versao, geo? }` → `{ ok, todos, registro }`. Confirmação vencida (2 h): volta ao passo 1 sem perder o documento, o nome, o CPF e a assinatura, e depois de confirmar repete o "Assinar".
5. **Pronto**: "Assinatura registrada" (com `todos`: "Todos assinaram. A VPX Engenharia vai mandar a via assinada…"; nos dois casos avisa do recibo por e-mail). Também "Recusar" (com motivo) → `POST /api/s/recusar { t, sessao, motivo }`.

Situações tratadas com mensagens claras: link inválido, já assinou, recusado, cancelado, expirado, ainda não é a sua vez (em ordem), sem internet. Avisos e erros com `role="alert"`/`status` (leitor de tela) e o foco vai para o passo seguinte.

### Página de verificação

`GET /v/<codigo>` (e `/v` com campo para digitar o código) serve `pagina-verificar.html`: `GET /api/v/<codigo>` → título, situação, datas, hash do original e do final, a trilha resumida (`trilha: { eventos, ultimo_hash, ultimo_em }` — **nunca** os detalhes, IPs ou e-mails), signatários (nome, papel, situação, data/hora da assinatura; e-mail e CPF **não** aparecem). Botão "Conferir um arquivo": a pessoa escolhe o PDF e a página calcula o SHA-256 no navegador e diz se é o original ou o assinado deste documento. `GET /api/f/<token>` baixa o PDF final (registra `baixou_final`).

### E-mails (Resend)

`POST https://api.resend.com/emails`, `from = REMETENTE`, `reply_to` = e-mail de quem criou. HTML simples com a logo (`https://vpxengenharia.github.io/vpx-visitas/logo.png`), botão laranja, texto em português e versão em texto. Tipos: pedido de assinatura (com a mensagem do remetente e o prazo), código de verificação, **recibo da assinatura** (para quem assinou, com o hash do evento e o do documento), lembrete, aviso ao criador (alguém assinou / recusou / todos assinaram), cancelado, documento assinado por todos (com o link de download). `mandarEmail` devolve `{ ok, id, erro }` e espera ~0,55 s entre envios seguidos (limite da Resend). **A trilha só diz que um e-mail saiu quando saiu** (`email_enviado`, `lembrete`, `recibo_enviado`, `email_final` com o id da Resend); quando não sai, grava `email_falhou` com o motivo e deixa `notificado_em` vazio (a tarefa diária ou "Reenviar e-mail" tentam de novo); o código que não sai responde 503 e libera um novo pedido; o lembrete que não sai responde 503. Só em `MODO_TESTE` o e-mail fica na lista de teste (e e-mails que começam com `falha@` simulam a falha); sem `RESEND_KEY` em produção, nada sai e cada envio fica registrado como `email_falhou`.

### Tarefa diária (cron)

- prazo vencido → `expirado` (avisa o criador);
- pedidos de assinatura que não saíram (`notificado_em` vazio) são enviados de novo;
- lembrete a cada 3 dias para signatários `link` pendentes que estão na vez (se `lembretes = 1`), no máximo 5 por signatário;
- apaga rascunhos com mais de 2 dias, sessões e códigos vencidos;
- apaga do KV os PDFs dos envelopes arquivados há mais de 30 dias e dos cancelados/recusados/expirados há mais de 30 dias (`pdfs_apagados_em`). Os dados do banco e os hashes ficam (servem para a verificação);
- LGPD: nos cancelados, recusados e expirados há mais de 90 dias, apaga dos signatários a imagem da assinatura, CPF, telefone, IP, aparelho, local e localização (ficam nomes, situações e hashes). Nos concluídos os dados ficam (a via final, que já os tem, é a prova); um prazo de guarda para eles é decisão do Gustavo.

### Testes do servidor

`npm test` dentro de `assinatura/` sobe o `wrangler dev` em modo de teste (D1 e KV locais) e roda um teste de ponta a ponta em Node (`test/ponta-a-ponta.mjs`): cria o envelope com um token de teste, sobe o PDF, envia, abre o link, pede e confere o código, baixa o PDF, assina (2 signatários: um pelo link, um pelo app), confere a conclusão e a trilha (versão 2), sobe o final, verifica e baixa, e os casos de erro (código errado 5×, CPF diferente, hash diferente, fora da vez, token inválido, origem não permitida, `id_token` vencido/de outro tenant, convidado, e-mail de fora, quem não é gestor, 20 tentativas de código e 6 pedidos de código ao mesmo tempo, 4 assinaturas ao mesmo tempo, assinar e recusar ao mesmo tempo, nome fora do Latin-1, imagem com pixels demais, e-mail que não sai, CSP).

## App (módulo Contratos)

- `CONFIG.assinaturaUrl` (vazio até o Gustavo publicar o servidor: a tela diz "O serviço de assinatura ainda não foi configurado").
- Função `contratos` ("Contratos (assinatura eletrônica)") em `FUNCOES`, **fora** do perfil padrão; `podeContratos()` = administrador ou função marcada para a pessoa (regra igual à do `podeTrans`). **O servidor confere de novo**: o administrador fixo manda a lista de quem tem a função (`enviarGestoresCt` → `PUT /api/gestores`, ao ler ou salvar as permissões e a cada sincronização, só quando a lista mudou; `vpx_ct_gestores`). Quem recebeu a função vale no servidor depois que o Gustavo abrir o app com internet.
- Onde aparece: submenu do **Comercial** no menu lateral ("Contratos"; aberta por ali, a lista fica sem "‹ Voltar", como as outras telas do menu), linha no **Mais** (celular), quadrado **Contratos** em "Documentos e controles" da página do cliente, e na oportunidade do Comercial na etapa **Fechar contrato** (código "07"): "Gerar contrato para assinatura" (já com cliente e orçamento). Número "aguardando a sua assinatura" quando há contrato para a pessoa assinar pelo app.
- Tela `tela-ct` (por cima, `com-nav` como as outras listas): tabela com os filtros no título das colunas (núcleo `filtrarFC`/`cabecalhoFC`): Contrato (título, cliente embaixo no celular) · Situação (selo + "2 de 3 assinaram") · Enviado em · Prazo; chips **Em andamento · Concluídos · Todos**; busca; Exportar PDF.
- **Novo contrato**: cliente (obrigatório; lista de clientes) e título → documento: **"Escolher PDF"** (recusa PDF com senha e PDF **protegido contra edição** — o pdf-lib tem de abri-lo sem ignorar a proteção, `conferirPdfLibCt`) ou **"Usar um modelo"** → signatários → em ordem? prazo (padrão 15 dias), lembretes, mensagem → **Revisar e enviar** (mostra o PDF no visualizador). O app calcula o SHA-256 do PDF, cria o envelope, sobe o PDF e envia. Se a resposta do envio se perde (sinal fraco), o app confere no servidor e, se já foi enviado, vai para a tela final (`concluirEnvioCt`). "Voltar e corrigir" cancela só um **rascunho** (`soRascunho`: o servidor não cancela um contrato já enviado; se era o caso, o app avisa). Enquanto envia ou assina, "voltar", as abas e o Esc não saem da tela. Tela final com cada signatário: **Enviar pelo WhatsApp** (texto com o link) e **Copiar link**.
- **Detalhe**: situação, código, cada signatário com a situação e a hora, **Assinar agora** (quando a vez é minha, modo `app`: baixa o PDF — registra `abriu_documento` — e confere o hash, abre no visualizador, depois o painel com nome/CPF já preenchidos, "Usar a minha assinatura salva" e o aceite, que vai ao servidor com a versão), Reenviar e-mail, Copiar link/WhatsApp, Ver documento, Ver trilha de eventos (com IP, local e aparelho resumido), Cancelar, Baixar o assinado, Abrir no OneDrive. Quando a montagem automática da via final falhou, o motivo aparece embaixo de "Montar agora".
- **PDF final** (pdf-lib 1.17.1): páginas do original com um rodapé em cada página ("Documento assinado eletronicamente · Código … · Verifique em <url_verificacao>", na borda de baixo de quem lê: respeita a CropBox e as páginas giradas com /Rotate) + **folha de assinaturas** (imagem da assinatura — PNG com mais de 2000×1000 px não entra —, nome, CPF, papel, e-mail, data e hora de Brasília, método, IP, aparelho, local aproximado) + **registro de eventos** (a trilha, com a fórmula para conferir) + hash SHA-256 do original e QR code da verificação (`qrcode-generator@1.4.4`). **Anexos dentro do PDF**: `trilha-de-eventos.json` (a base, a fórmula e cada evento cru — hora ISO com milissegundos, ids, ip, aparelho, local, detalhe, anterior, hash — para um perito refazer a conta) e `original.pdf` (o documento cujo hash é o `hash_original`; fica de fora só se o final passar de 24 MB). PDF original protegido contra edição: para antes do `PUT …/final` (a via sairia ilegível). O hash do PDF final é calculado depois de montar e vai no `PUT …/final`.
- Quem abrir o app primeiro (com a função) depois que todos assinaram monta e envia o final; `409` = outro aparelho já montou → relê o contrato e baixa o final do servidor, **conferindo o SHA-256 com o `hash_final` gravado** (a via do serviço também é conferida antes de abrir ou compartilhar). Depois grava em `02 - Clientes › <cliente> › 01 - Contrato` (`caminhoCli`; sem a pasta do cliente, em `02 - Clientes › 00 - Contratos Assinados`) `<título> - assinado.pdf` **e `<título> - original.pdf`**, e chama `…/arquivado`.
- Contrato concluído ligado a uma oportunidade do Comercial na etapa Fechar contrato → a oportunidade vai para **Fechado** (código "08"), com a anotação "Contrato assinado por todos" no histórico. Feito à parte da via final (`fecharOportunidadesCt`, por quem tem o Comercial, a cada sincronização, para os concluídos dos últimos 30 dias; cada contrato uma vez por aparelho, `vpx_ct_oport`).
- Sincronização: ao abrir o app, ao abrir a tela e a cada 60 s com ela aberta; páginas da lista até acabar (`mais`); `desde` com 5 min de folga (uma gravação que terminou depois da leitura anterior ainda entra). Cópia em `localStorage` `vpx_ct` **sem** CPF, IP, aparelho, local, localização e imagens (`leveCt`); quem não cuida dos contratos guarda só os seus (`ctDados.todos`; ao passar a cuidar, baixa a lista inteira). O contrato aberto não perde a trilha numa sincronização (é relido). Toda gravação dentro de `comGravacao`.

## Modelos de contrato

Arquivo `VPX Visitas - Configuração/contratos-modelos.json` (pasta de configuração que a equipe já lê):

```json
{
  "versao": 1,
  "contratada": { "razao": "VPX ENGENHARIA LTDA", "cnpj": "…", "endereco": "…", "representante": { "nome": "…", "cpf": "…", "email": "…" } },
  "cidade": "Salvador-BA",
  "modelos": [
    {
      "id": "laudos",
      "nome": "Laudos e serviços técnicos (execução única)",
      "descricao": "…",
      "titulo": "CONTRATO DE PRESTAÇÃO DE SERVIÇOS",
      "campos": [
        { "id": "objeto", "rotulo": "Objeto (o que será feito)", "tipo": "textoLongo", "padrao": "…" },
        { "id": "itens", "rotulo": "Serviços incluídos", "tipo": "lista", "padrao": ["…"] },
        { "id": "valor", "rotulo": "Valor global (R$)", "tipo": "valor" },
        { "id": "pagamento", "rotulo": "Forma de pagamento", "tipo": "textoLongo", "padrao": "…" }
      ],
      "clausulas": [
        { "titulo": "PARTES", "itens": [ { "nivel": 0, "texto": "CONTRATANTE: {{contratante.razao}}, inscrito(a) no CNPJ/CPF sob nº {{contratante.doc}}, …" } ] },
        { "titulo": "DO OBJETO E DOS DOCUMENTOS INTEGRANTES", "itens": [ { "nivel": 1, "texto": "O presente contrato tem por objeto {{objeto}}, nos limites definidos no Orçamento VPX Engenharia nº {{orcamento.numero}}, datado de {{orcamento.data}}, …" }, { "nivel": 2, "lista": "itens" } ] }
      ]
    }
  ]
}
```

- Numeração como nos contratos da VPX: a cláusula `n` sai como "n. TÍTULO"; itens de `nivel` 1 como "n.1, n.2…"; `nivel` 2 como "n.1.1…"; `nivel` 0 sem número (parágrafo). Um item com `"lista": "<campo>"` vira um subitem por linha do campo do tipo lista.
- Variáveis fixas: `{{contratante.razao}}`, `{{contratante.doc}}` (CNPJ/CPF formatado), `{{contratante.endereco}}`, `{{representante.nome}}`, `{{representante.cpf}}`, `{{representante.cargo}}` ("seu síndico", "sua sócia"…), `{{contratada.razao}}`, `{{contratada.cnpj}}`, `{{contratada.endereco}}`, `{{contratada.representante.nome}}`, `{{contratada.representante.cpf}}`, `{{orcamento.numero}}`, `{{orcamento.data}}`, `{{valor}}` ("R$ 1.200,00"), `{{valor.extenso}}` ("mil e duzentos reais"), `{{cidade}}`, `{{data.extenso}}` ("26 de outubro de 2026"), e cada `{{<id do campo>}}`.
- No formulário: escolher o modelo, os campos (o app sugere o que sabe: razão social, CNPJ e endereço da ficha do cliente; representante = contato principal; número, data e valor do orçamento da oportunidade), e cada cláusula pode ser aberta e editada só para este contrato. O PDF (jsPDF, A4, logo, texto justificado, numeração, rodapé com página) fica com o bloco final das partes **sem linhas para assinar** ("Assinado eletronicamente — ver folha de assinaturas").
- Os 3 modelos iniciais saem dos contratos atuais da VPX (Jaguaribe 1150 — laudos de execução única; Lótus 1159 — adequações físicas; Tribeca 1162 — manutenção recorrente), com os dados do cliente trocados por variáveis. **Estes textos não vão para o GitHub** (o site é público): ficam só no OneDrive.

## O que o Gustavo precisa configurar (uma vez)

1. Conta grátis na Cloudflare (o Claude roda `wrangler login`, que abre o navegador para ele autorizar; depois cria o banco, o KV e publica).
2. Conta grátis na Resend e verificar o domínio `vpxengenharia.com.br`: copiar 3 registros (SPF/MX do subdomínio `send` e o DKIM) para o **Centro de administração do Microsoft 365 › Configurações › Domínios › vpxengenharia.com.br › Registros DNS** (o DNS do domínio está no Microsoft 365). Não mexe nos e-mails do Outlook.
3. Nada no Entra. Endereço novo (regra 3 do CLAUDE.md): `https://vpx-assinatura.<conta>.workers.dev` (dá para usar `assinar.vpxengenharia.com.br` depois).
4. Marcar a função "Contratos" para quem pode criar contratos e **abrir o app uma vez com internet** (o app do Gustavo manda a lista ao servidor). Para mais um administrador do serviço, acrescentar o e-mail em `ADMINS` no `wrangler.toml` e publicar.

## Validade jurídica (o que dizer ao Gustavo)

- Entre particulares vale a MP 2.200-2/2001, art. 10, § 2º: assinatura eletrônica sem ICP-Brasil vale quando as partes a aceitam. Os contratos da VPX já têm a cláusula ("As partes reconhecem como válidas as assinaturas eletrônicas…").
- A prova vem do conjunto: código por e-mail (a pessoa controla o e-mail), hora e IP do servidor, hash SHA-256 do documento visto, trilha encadeada e a via final enviada por e-mail a todos.
- Por ser um sistema da própria VPX (não uma empresa neutra), **manter as 2 testemunhas** quando o contrato precisar valer como título executivo (CPC, art. 784, § 4º, fala em integridade "conferida por provedor de assinatura").
