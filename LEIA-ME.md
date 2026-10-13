# VPX Visitas — instalação

O app já vem configurado para salvar em
**VPX Engenharia - AVCB › 06 - Comercial › 02 - Clientes › [Cliente] › 06 - Fotos e Visitas Técnicas**, enviando a foto original, sem compressão.

As Partes 1 a 4 são feitas **uma única vez, por você, no computador** (uns 15 minutos). A Parte 5 é feita em cada pessoa da equipe.

## Parte 1 — Compartilhar a pasta de clientes com a equipe

1. No OneDrive (navegador ou Explorador de Arquivos), vá até *VPX Engenharia - AVCB › 06 - Comercial*.
2. Clique com o botão direito em **02 - Clientes → Compartilhar**.
3. Adicione o e-mail @vpxengenharia.com.br de cada pessoa que vai a campo, com permissão **Pode editar**.

Você não precisa se compartilhar consigo mesmo.

Para a aba **Comprovantes**, faça o mesmo com a pasta *VPX Engenharia - AVCB › 02 - Financeiro* › **01 - Comprovantes** (botão direito → Compartilhar → e-mail de cada pessoa → **Pode editar**). Quem tiver acesso a ela consegue ver os comprovantes de todos.

## Parte 2 — Colocar o site no ar (GitHub Pages, grátis)

1. Crie uma conta gratuita em **github.com**.
2. Clique em **New repository**, nome `vpx-visitas`, deixe **Public** e clique em **Create repository**.
   (O código não tem senha nem dado sensível. Os arquivos só são acessados depois do login com a conta Microsoft da VPX, e só por quem tem acesso à pasta.)
3. Clique em **uploading an existing file**, arraste `index.html`, `manifest.webmanifest` e os 3 ícones `icone-*.png`, e clique em **Commit changes**.
4. Vá em **Settings → Pages**, escolha **Deploy from a branch**, branch **main**, pasta **/(root)**, e clique em **Save**.
5. Após 1 a 2 minutos, aparece o endereço, por exemplo `https://SEU-USUARIO.github.io/vpx-visitas/`.
   **Anote o endereço exato, com a barra no final.**

## Parte 3 — Registrar o app na Microsoft (Entra ID)

1. Entre em **entra.microsoft.com** com a conta administradora do Microsoft 365 da VPX.
2. **Aplicativos → Registros de aplicativo → Novo registro**:
   - **Nome:** VPX Visitas
   - **Tipos de conta:** Somente contas neste diretório organizacional
   - **URI de redirecionamento:** plataforma **Aplicativo de página única (SPA)** + o endereço da Parte 2
3. Clique em **Registrar** e copie o **ID do aplicativo (cliente)** e o **ID do diretório (locatário)**.
4. **Permissões de API → Adicionar uma permissão → Microsoft Graph → Permissões delegadas**. Marque **Files.ReadWrite.All** e **Calendars.Read** (esta é para a agenda) e clique em **Adicionar permissões**.
5. Clique em **Conceder consentimento do administrador para VPX** e confirme. Assim ninguém da equipe precisa aprovar nada no primeiro login.

## Parte 4 — Ligar o site ao registro

1. No GitHub, abra `index.html` e clique no **lápis** (Edit).
2. No bloco `CONFIG`, no início do script, troque:
   - `COLE_AQUI_O_ID_DO_APLICATIVO` pelo **ID do aplicativo (cliente)**
   - `COLE_AQUI_O_ID_DO_DIRETORIO` pelo **ID do diretório (locatário)**
3. Clique em **Commit changes** e espere 1 minuto.

## Parte 5 — Instalar no celular de cada pessoa

Envie o endereço da Parte 2 por WhatsApp ou e-mail.

**iPhone**
1. Abra o link no **Safari** (precisa ser o Safari; pelo WhatsApp, toque em "Abrir no Safari").
2. Toque no botão **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início** → **Adicionar**.
3. Abra pelo ícone **VPX Visitas** e toque em **Entrar com a conta da VPX** usando o e-mail @vpxengenharia.com.br da pessoa.
4. Para o app não pedir permissão toda vez que é aberto: **Ajustes › Apps › Safari › Câmera › Permitir** e **Ajustes › Apps › Safari › Microfone › Permitir** (o microfone é para o som dos vídeos; em iOS mais antigos: **Ajustes › Safari**).

**Android**
1. Abra o link no **Chrome**.
2. Menu **⋮** → **Instalar app** (ou *Adicionar à tela inicial*).
3. Abra pelo ícone e entre com a conta da VPX.

O login fica salvo. Nas próximas vezes é só abrir e usar.

## Como usar

1. **Cliente** → escolha da lista ou digite um nome novo para criar a pasta.
2. Fotos e vídeos, de dois jeitos:
   - **Câmera**: câmera do próprio app. Embaixo do botão, escolha **FOTO** (várias fotos seguidas, com zoom 1×, 2×, 3× ou pinça, e lanterna) ou **VÍDEO** (toque para começar e de novo para parar; Full HD, com som, até 5 minutos por vídeo). No iPhone a qualidade é um pouco menor que a da câmera do iPhone, o zoom é digital e não funciona no vídeo.
   - **Galeria**: marque várias fotos e vídeos de uma vez. No iPhone, para muitas fotos com qualidade máxima, tire pelo app Câmera do iPhone (sem rajada) e depois escolha todas pela Galeria.
3. **Salvar no cliente** → todas sobem juntas, com nomes do tipo `João da Silva_2026-10-09_Diamond_01.jpg` (colaborador, data, cliente e número). A numeração continua no mesmo dia: se já existem _01 e _02 da pessoa naquele cliente, o próximo envio começa em _03.

Vídeos são grandes (1 minuto pode passar de 100 MB): no 4G o envio demora. Se der, envie vídeos no Wi-Fi. Se a internet oscilar durante um vídeo, o envio continua de onde parou.

**Sem internet (obra, subsolo):** o app abre e funciona normalmente. As fotos ficam guardadas no celular assim que são tiradas — se o app fechar ou a bateria acabar, elas voltam ao abrir de novo. Se tocar em Salvar sem sinal, as fotos ficam com **⏳** e aparece o aviso "aguardando internet"; quando o sinal voltar, o app envia sozinho, cada uma para o cliente/pasta certo, mesmo que você já tenha trocado de cliente. O envio automático acontece com o app aberto (ou na próxima vez que ele for aberto). Itens com **!** tiveram outro problema (ex.: sem acesso à pasta) e o app também tenta de novo.

### Agenda

O botão de **calendário**, no topo, mostra a sua agenda do Outlook de 30 dias atrás a 30 dias à frente, agrupada por dia e já posicionada em **hoje**. Toque num compromisso para ver horário, local (com link para o mapa), organizador, observações e os botões "Entrar na reunião" (Teams) e "Abrir no Outlook". Sem internet, aparece a última agenda carregada. Na primeira vez, toque em **Autorizar acesso à agenda** (precisa da permissão **Calendars.Read** liberada no Entra — Parte 3).

### Validade AVCB/CLCB

O botão **AVCB**, no topo, abre a lista de clientes com a validade do AVCB/CLCB: vencidos, que vencem em até 3 meses e em dia (o número vermelho no botão é vencidos + vencendo). Ao escolher um cliente que está na lista (Visita técnica ou Comercial), aparece um aviso colorido, por exemplo "AVCB vence em 10 dias". A lista é copiada do painel "Validade AVCB/CLCB" do Claude e precisa ser atualizada quando o painel mudar.

**Fotografar AVCB:** na tela AVCB, toque em **Fotografar AVCB** (ou **Galeria**) e fotografe o documento de perto, reto e sem reflexo. O app lê sozinho o nome, o tipo (AVCB/CLCB), o número, a validade, o CNPJ e o endereço. **Confira cada campo com a foto**, corrija se precisar, escolha **Cliente** ou **Prospecção** e toque em **Salvar AVCB**. A foto e os dados vão para *02 - Clientes › 00 - Validade AVCB* e o estabelecimento passa a aparecer na lista de todos (use os botões Todos / Clientes / Prospecção para filtrar). Sem internet, fica guardado com ⏳ e é enviado quando o sinal voltar. A leitura automática precisa de internet na primeira vez que é usada no celular; sem ela, é só preencher os campos à mão.

### Comercial (ficha de levantamento)

1. Toque na aba **Comercial** e escolha o **cliente**.
2. Preencha a ficha: edificação (tipo, ano, andares, garagem, torres, unidades, área), situação no Corpo de Bombeiros (AVCB, validade, projeto aprovado, notificação), sistemas existentes (inclui gerador), contatos (síndico, administradora, zelador) e dados comerciais (serviços de interesse, urgência, como conheceu a VPX, próximo passo, observações). Obrigatórios: tipo da edificação, andares, se já tem AVCB e pelo menos um telefone de contato.
3. Se quiser, tire fotos (fachada, casa de bombas, hidrantes…) — só foto, sem vídeo.
4. **Salvar ficha** → gera um PDF com as respostas e as fotos e salva tudo em *02 - Clientes › [Cliente] › 06 - Fotos e Visitas Técnicas*, junto com as fotos de visita. O PDF se chama, por exemplo, `João da Silva_2026-10-12_Diamond_Relatório de Visita_01.pdf`.

5. Na tela final: **Ver relatório** abre o PDF no próprio app e **Compartilhar relatório** abre o menu do celular (WhatsApp, e-mail, Teams, Arquivos…) com o PDF anexado. No computador, o PDF é baixado para anexar.

O que for preenchido fica guardado no celular até salvar (se o app fechar, a ficha volta). Funciona sem internet: o PDF é gerado no celular, já pode ser visto e compartilhado, e vai para o OneDrive quando o sinal voltar.

### Arquivos do cliente (plantas e projetos)

Depois de escolher o cliente (Visita técnica, Comercial ou Laudos), toque em **📁 Arquivos do cliente** para ver tudo o que está na pasta dele no OneDrive. PDFs e fotos abrem no próprio app: use **−** e **+** para aproximar e gire o celular para ver plantas deitadas. Outros arquivos (Word, Excel, DWG) abrem no OneDrive.

**Sem internet (subsolo, casa de bombas):** antes de ir, abra a pasta que vai precisar (por exemplo, a do projeto ou a do cliente inteiro) e toque em **Baixar esta pasta para usar sem internet**. O app mostra quantos arquivos e quantos MB são antes de baixar (vídeos não são baixados). Os arquivos guardados aparecem com **✓ no celular** e abrem mesmo sem sinal. Para liberar espaço, use o botão no fim da lista para apagar do celular os arquivos daquele cliente (eles continuam no OneDrive).

### Laudos técnicos

1. Toque na aba **Laudos**, escolha o **cliente** e o tipo: **Hidrantes, Elétrica, Alarme, Gás, Gerador ou SPDA**.
2. Escolha o **responsável técnico** (Eng. Gustavo Ponchio ou Eng. William Reis). Endereço, acompanhante e ART são opcionais.
3. Em cada item, toque em **Conforme**, **Não conforme** ou **N/A**. No não conforme, escreva a observação. Em qualquer item dá para tirar **📷 Foto** (vão para dentro do laudo).
4. Hidrantes, quadros elétricos, pavimentos do alarme e pontos de gás: use **+ Adicionar** para cada um e informe o local.
5. Preencha as medições (pressão, resistência, tensão…), escolha o **resultado** (Apto / Apto com ressalvas / Não apto), escreva as recomendações (o botão "Sugerir" lista as não conformidades) e **assine com o dedo**.
6. O botão de baixo mostra o que falta; tocando nele, o app leva até o item. Quando estiver tudo certo: **Gerar laudo em PDF**. O PDF vai para *02 - Clientes › [Cliente] › Laudos Técnicos*, por exemplo `João da Silva_2026-10-12_Diamond_Laudo de Hidrantes_01.pdf`, e pode ser visto e compartilhado na hora.

O laudo fica guardado no celular enquanto é preenchido (pode fechar o app e continuar depois) e funciona sem internet.

### Comprovantes

1. Toque na aba **Comprovantes**, no topo.
2. Escolha **Compra** (nota fiscal) ou **Reembolso** (gasto pago do próprio bolso). Na compra, informe também **como foi pago**: **Cartão de crédito corporativo** ou **Conta corrente corporativa**.
3. Escreva a **descrição** (ex.: "Combustível") e, se houver, escolha o **centro de custo** na lista (a mesma do Fin365). Se não estiver na lista, escolha **Outro (digitar)** e escreva.
4. Fotografe a nota ou o recibo (**Câmera**), ou escolha pela **Galeria**, que também aceita PDF.
5. **Salvar** → vai direto para *02 - Financeiro › 01 - Comprovantes › Compras* (ou *Reembolsos*), numa pasta única para todas as pessoas, com nomes do tipo `João da Silva_2026-10-08_Compra_Cartão Corporativo_Combustível_Obra Diamond_01.jpg` (no reembolso não há forma de pagamento: `João da Silva_2026-10-08_Reembolso_Almoço_01.jpg`). Como o nome da pessoa vem primeiro, a pasta fica agrupada por colaborador e, dentro dele, por data.

## Problemas comuns

- **Erro AADSTS50011 no login:** o endereço da Parte 3 está diferente do site. Confira a barra no final.
- **"Sem acesso à pasta 02 - Clientes":** a pasta não foi compartilhada com essa pessoa com permissão de edição (Parte 1).
- **"Sem acesso à pasta 01 - Comprovantes":** a pasta de comprovantes não foi compartilhada com essa pessoa (Parte 1).
- **Tela "Falta configurar o app":** os IDs da Parte 4 não foram preenchidos.
- **Envio lento no 4G:** fotos originais são grandes. Se quiser mais velocidade, troque `reduzirFotos: false` por `true` no CONFIG.
