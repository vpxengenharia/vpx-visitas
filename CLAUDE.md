# VPX Visitas — instruções para o Claude Code

App web (PWA) da VPX Engenharia para a equipe de campo tirar fotos em visitas técnicas e salvar tudo, com um toque, na pasta do cliente no OneDrive. O usuário (Gustavo, dono da VPX) não é programador: fale em português, de forma simples, e explique o que mudou em poucas linhas.

## Como funciona

- Site estático publicado pelo **GitHub Pages** a partir da branch `main`, pasta raiz:
  `https://vpxengenharia.github.io/vpx-visitas/`
- Arquivos: `index.html` (app inteiro: HTML, CSS e JS num arquivo só), `manifest.webmanifest`, `icone-180.png`, `icone-192.png`, `icone-512.png`, `logo.png` (logo colorida, fundo transparente), `logo-branco.png` (letras brancas, para fundo azul ou modo escuro) e `sw.js` (service worker: cópia do app no celular para abrir sem internet).
- **Funciona sem internet (fila):** cada foto/vídeo/PDF é guardado no celular (IndexedDB `vpx-visitas`, stores `itens` e `arquivos`) assim que entra na lista e só é apagado depois de chegar ao OneDrive. Ao tocar em Salvar, o destino e o nome de cada item são congelados (`destinoAtual`, `nomeBaseDe`, campos `dest`/`nomeBase`), então um item que fica na fila vai para o lugar certo mesmo que a pessoa troque de cliente/aba. Itens sem internet ficam `pendente` (⏳); a fila é reenviada sozinha (`tentarPendentes`) ao abrir o app, no evento `online`, ao voltar para a tela e a cada 60 s — só com o app aberto (iPhone não permite envio em segundo plano). O envio automático nunca redireciona para o login da Microsoft. `sw.js`: página com rede primeiro (5 s) e cópia como reserva; logos, ícones, fontes e MSAL da cópia; Microsoft nunca passa pelo cache. Se trocar logo/ícone, mude `CACHE` em `sw.js`.
- Login com conta Microsoft 365 da VPX via **MSAL.js 2.38.3**, carregado do jsDelivr:
  `https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.3/lib/msal-browser.min.js`
  (o CDN `alcdn.msauth.net` não funcionou — não volte para ele).
- Acesso ao OneDrive pela **Microsoft Graph** com a permissão delegada `Files.ReadWrite.All`.
- Destino das fotos: `VPX Engenharia - AVCB › 06 - Comercial › 02 - Clientes › [Cliente] › 06 - Fotos e Visitas Técnicas`, no OneDrive do Gustavo, compartilhado com a equipe. O app cria a subpasta se ela não existir.
- Fotos enviadas no original (`reduzirFotos: false`); arquivos acima de 4 MB usam upload session, que retoma de onde parou (`nextExpectedRanges`) se a conexão cair.
- Vídeos: gravados na câmera do app (modo **VÍDEO**, `MediaRecorder`, Full HD, 5 Mbps, limite de 5 min porque o vídeo fica na memória; mp4 quando o navegador suporta, senão webm) ou escolhidos na Galeria. Vão para a mesma pasta, com o mesmo padrão de nome. A miniatura é um quadro gerado uma vez em `gerarCapa`. Não há mais botão de vídeo nativo.

## Regras

1. **Bloco `CONFIG`** no início do script: não altere `clientId`, `tenantId`, `driveId` nem `pastaClientesId` sem o Gustavo pedir. Esses valores vêm do registro no Microsoft Entra e da estrutura real do OneDrive.
2. Mantenha o app em **um único `index.html`** autocontido (exceção: `sw.js`, que o navegador exige em arquivo separado para o app abrir sem internet). Bibliotecas externas só por `<script>` com versão fixa (nunca `@latest`).
3. Se uma mudança exigir **nova permissão da Microsoft** (calendário, e-mail, SharePoint etc.) ou mudar o endereço do site, **avise o Gustavo antes**: ele precisará ajustar o registro no portal Entra. Diga exatamente o que adicionar.
4. Antes de publicar, confira a sintaxe do JavaScript (por exemplo, extraindo o `<script>` e rodando `node --check`, se o Node estiver disponível) e revise o diff.
5. Publicar = `git add`, `git commit` com mensagem curta em português descrevendo a melhoria, e `git push` para `main`. O GitHub Pages atualiza em 1 a 2 minutos; os celulares pegam a versão nova ao fechar e abrir o app.
6. Não é possível testar o login daqui. Depois de publicar, peça ao Gustavo para abrir o site com Ctrl+F5 e testar a mudança.
7. Interface pensada para celular, uso em obra, com uma mão: botões grandes, alto contraste. Cores da marca: azul `#1C3C61` e laranja `#EB9D2B`. Fontes Barlow / Barlow Semi Condensed.

## Contexto útil

- **Aba "Comprovantes"** (antes "Notas e reembolsos") (modo `comp`): salva em `VPX Engenharia - AVCB/02 - Financeiro/01 - Comprovantes/{Compras|Reembolsos}` (direto na pasta, sem subpasta por colaborador nem por mês — pedido do Gustavo). Campos: tipo (obrigatório), forma de pagamento só na compra (obrigatória: Cartão Corporativo ou Conta Corrente Corporativa), descrição (obrigatória), centro de custo (opcional; lista `CONFIG.centrosCusto` copiada à mão do Fin365 — sistema na nuvem em app.fin365.com.br › Cadastros › Centros de Custos — mais "Outro (digitar)"; só entra no nome do arquivo, com "/" trocado por "-"). Cada item é [nome, descrição]: o app mostra "código · descrição" em ordem crescente de código e o arquivo leva só o nome. Para atualizar a lista: o Gustavo entra no Fin365 pelo navegador e o Claude lê a página de cadastro (com a janela larga, ~1400 px, para a coluna Descrição aparecer); o app não acessa o Fin365 diretamente (precisaria da senha). Nome: `Colaborador_AAAA-MM-DD_{Compra_FormaDePagamento|Reembolso}_Descrição_CentroDeCusto_NN.ext` (colaborador pelo login, na frente para agrupar por pessoa; data da própria foto; sem hora). Aceita PDF; não aceita vídeo. A pasta `01 - Comprovantes` precisa estar compartilhada com a equipe; o app a acha pelo caminho a partir da raiz do drive e, se der 403/404, por `/me/drive/sharedWithMe`.

- Pastas ignoradas na lista de clientes: `01 - Arquivado` e cópias de conflito com `-DESKTOP-` no nome.
- Alguns clientes antigos ainda têm uma pasta `Fotos` (padrão anterior). No cliente Franz Schubert existe `06 - Fotos e Visitas Técnicas/Registros`. O padrão atual é salvar direto em `06 - Fotos e Visitas Técnicas`.
- iPhone: o app instalado na tela inicial pede permissão da câmera a cada abertura (regra do iOS, não dá para resolver no código). Resolve em **Ajustes › Apps › Safari › Câmera › Permitir** — testado e confirmado pelo Gustavo.
- iPhone não permite tirar várias fotos seguidas com a câmera nativa a partir de um site; por isso o único botão **Câmera** abre a câmera do próprio app (getUserMedia, visual inspirado na câmera do iPhone), com modos FOTO e VÍDEO (VÍDEO some na aba de comprovantes). Os botões de câmera nativa (foto e vídeo) foram removidos a pedido do Gustavo. O microfone só é pedido ao trocar para VÍDEO; sem permissão, grava sem som.
- Orientação: o app é usado na vertical. Android (app instalado): `screen.orientation.lock("portrait")`, destravado enquanto a câmera está aberta (para fotos deitadas saírem certas). iPhone não permite travar: fora da câmera aparece a tela "Gire o celular para a vertical" (CSS, celular deitado com altura até 500 px). A câmera deitada mostra os botões numa coluna à direita.
- Nome dos arquivos (visita): `Colaborador_AAAA-MM-DD_NN.ext` (nome de quem enviou pelo login, data do envio, número; sem hora).
- Numeração contínua (visitas e comprovantes): ao salvar fica congelado só o início do nome (`prefixo`); o NN é decidido na hora do envio (`numerar` em `enviarFila`), lendo os nomes da pasta e continuando do maior número já usado para o mesmo início (ignora outras pessoas/datas; reconhece cópias "_07 1.jpg" do OneDrive). Depois de decidido, o número fica gravado no item (`nomeBase`) para não mudar em novas tentativas.
