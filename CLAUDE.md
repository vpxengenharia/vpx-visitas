# VPX Visitas — instruções para o Claude Code

App web (PWA) da VPX Engenharia para a equipe de campo tirar fotos em visitas técnicas e salvar tudo, com um toque, na pasta do cliente no OneDrive. O usuário (Gustavo, dono da VPX) não é programador: fale em português, de forma simples, e explique o que mudou em poucas linhas.

## Como funciona

- Site estático publicado pelo **GitHub Pages** a partir da branch `main`, pasta raiz:
  `https://vpxengenharia.github.io/vpx-visitas/`
- Arquivos: `index.html` (app inteiro: HTML, CSS e JS num arquivo só), `manifest.webmanifest`, `icone-180.png`, `icone-192.png`, `icone-512.png`, `logo.png` (logo colorida, fundo transparente) e `logo-branco.png` (letras brancas, para fundo azul ou modo escuro).
- Login com conta Microsoft 365 da VPX via **MSAL.js 2.38.3**, carregado do jsDelivr:
  `https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.3/lib/msal-browser.min.js`
  (o CDN `alcdn.msauth.net` não funcionou — não volte para ele).
- Acesso ao OneDrive pela **Microsoft Graph** com a permissão delegada `Files.ReadWrite.All`.
- Destino das fotos: `VPX Engenharia - AVCB › 06 - Comercial › 02 - Clientes › [Cliente] › 06 - Fotos e Visitas Técnicas`, no OneDrive do Gustavo, compartilhado com a equipe. O app cria a subpasta se ela não existir.
- Fotos enviadas no original (`reduzirFotos: false`); arquivos acima de 4 MB usam upload session, que retoma de onde parou (`nextExpectedRanges`) se a conexão cair.
- Vídeos: gravados na câmera do app (modo **VÍDEO**, `MediaRecorder`, Full HD, 5 Mbps, limite de 5 min porque o vídeo fica na memória; mp4 quando o navegador suporta, senão webm) ou escolhidos na Galeria. Vão para a mesma pasta, com o mesmo padrão de nome. A miniatura é um quadro gerado uma vez em `gerarCapa`. Não há mais botão de vídeo nativo.

## Regras

1. **Bloco `CONFIG`** no início do script: não altere `clientId`, `tenantId`, `driveId` nem `pastaClientesId` sem o Gustavo pedir. Esses valores vêm do registro no Microsoft Entra e da estrutura real do OneDrive.
2. Mantenha o app em **um único `index.html`** autocontido. Bibliotecas externas só por `<script>` com versão fixa (nunca `@latest`).
3. Se uma mudança exigir **nova permissão da Microsoft** (calendário, e-mail, SharePoint etc.) ou mudar o endereço do site, **avise o Gustavo antes**: ele precisará ajustar o registro no portal Entra. Diga exatamente o que adicionar.
4. Antes de publicar, confira a sintaxe do JavaScript (por exemplo, extraindo o `<script>` e rodando `node --check`, se o Node estiver disponível) e revise o diff.
5. Publicar = `git add`, `git commit` com mensagem curta em português descrevendo a melhoria, e `git push` para `main`. O GitHub Pages atualiza em 1 a 2 minutos; os celulares pegam a versão nova ao fechar e abrir o app.
6. Não é possível testar o login daqui. Depois de publicar, peça ao Gustavo para abrir o site com Ctrl+F5 e testar a mudança.
7. Interface pensada para celular, uso em obra, com uma mão: botões grandes, alto contraste. Cores da marca: azul `#1C3C61` e laranja `#EB9D2B`. Fontes Barlow / Barlow Semi Condensed.

## Contexto útil

- **Aba "Notas e reembolsos"** (modo `comp`): salva em `VPX Engenharia - AVCB/02 - Financeiro/01 - Comprovantes/{Compras|Reembolsos}` (direto na pasta, sem subpasta por colaborador nem por mês — pedido do Gustavo). Campos: tipo (obrigatório), descrição (obrigatória), centro de custo (texto livre, opcional, só entra no nome do arquivo). Nome: `Colaborador_AAAA-MM-DD_{Compra|Reembolso}_Descrição_CentroDeCusto_NN.ext` (colaborador pelo login, na frente para agrupar por pessoa; data da própria foto; sem hora). Aceita PDF; não aceita vídeo. A pasta `01 - Comprovantes` precisa estar compartilhada com a equipe; o app a acha pelo caminho a partir da raiz do drive e, se der 403/404, por `/me/drive/sharedWithMe`.

- Pastas ignoradas na lista de clientes: `01 - Arquivado` e cópias de conflito com `-DESKTOP-` no nome.
- Alguns clientes antigos ainda têm uma pasta `Fotos` (padrão anterior). No cliente Franz Schubert existe `06 - Fotos e Visitas Técnicas/Registros`. O padrão atual é salvar direto em `06 - Fotos e Visitas Técnicas`.
- iPhone: o app instalado na tela inicial pede permissão da câmera a cada abertura (regra do iOS, não dá para resolver no código). Resolve em **Ajustes › Apps › Safari › Câmera › Permitir** — testado e confirmado pelo Gustavo.
- iPhone não permite tirar várias fotos seguidas com a câmera nativa a partir de um site; por isso o único botão **Câmera** abre a câmera do próprio app (getUserMedia, visual inspirado na câmera do iPhone), com modos FOTO e VÍDEO (VÍDEO some na aba de comprovantes). Os botões de câmera nativa (foto e vídeo) foram removidos a pedido do Gustavo. O microfone só é pedido ao trocar para VÍDEO; sem permissão, grava sem som.
- Orientação: o app é usado na vertical. Android (app instalado): `screen.orientation.lock("portrait")`, destravado enquanto a câmera está aberta (para fotos deitadas saírem certas). iPhone não permite travar: fora da câmera aparece a tela "Gire o celular para a vertical" (CSS, celular deitado com altura até 500 px). A câmera deitada mostra os botões numa coluna à direita.
- Nome dos arquivos (visita): `AAAA-MM-DD_HH-MM_Colaborador_NN.ext` (data do envio, hora da foto, nome de quem enviou pelo login, número de ordem).
