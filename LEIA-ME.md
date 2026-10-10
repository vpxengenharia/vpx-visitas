# VPX Visitas — instalação

O app já vem configurado para salvar em
**VPX Engenharia - AVCB › 06 - Comercial › 02 - Clientes › [Cliente] › 06 - Fotos e Visitas Técnicas**, enviando a foto original, sem compressão.

As Partes 1 a 4 são feitas **uma única vez, por você, no computador** (uns 15 minutos). A Parte 5 é feita em cada pessoa da equipe.

## Parte 1 — Compartilhar a pasta de clientes com a equipe

1. No OneDrive (navegador ou Explorador de Arquivos), vá até *VPX Engenharia - AVCB › 06 - Comercial*.
2. Clique com o botão direito em **02 - Clientes → Compartilhar**.
3. Adicione o e-mail @vpxengenharia.com.br de cada pessoa que vai a campo, com permissão **Pode editar**.

Você não precisa se compartilhar consigo mesmo.

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
4. **Permissões de API → Adicionar uma permissão → Microsoft Graph → Permissões delegadas**. Marque **Files.ReadWrite.All** e clique em **Adicionar permissões**.
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
4. Para o app não pedir permissão da câmera toda vez que é aberto: **Ajustes › Apps › Safari › Câmera › Permitir** (em iOS mais antigos: **Ajustes › Safari › Câmera**).

**Android**
1. Abra o link no **Chrome**.
2. Menu **⋮** → **Instalar app** (ou *Adicionar à tela inicial*).
3. Abra pelo ícone e entre com a conta da VPX.

O login fica salvo. Nas próximas vezes é só abrir e usar.

## Como usar

1. **Cliente** → escolha da lista ou digite um nome novo para criar a pasta.
2. Fotos, de três jeitos:
   - **Câmera**: câmera do celular, uma foto por vez, qualidade máxima.
   - **Sequência**: várias fotos seguidas dentro do app, com zoom (1x, 2x, 3x ou pinça). No iPhone a qualidade é um pouco menor e o zoom é digital.
   - **Galeria**: marque várias de uma vez. No iPhone, para muitas fotos com qualidade máxima, tire pelo app Câmera do iPhone (sem rajada) e depois escolha todas pela Galeria.
3. **Salvar no cliente** → todas sobem juntas, com nomes do tipo `2026-10-09_14-32-05_01.jpg`.

Se a internet cair, as fotos que faltaram ficam com **!**. Toque em Salvar de novo.

## Problemas comuns

- **Erro AADSTS50011 no login:** o endereço da Parte 3 está diferente do site. Confira a barra no final.
- **"Sem acesso à pasta 02 - Clientes":** a pasta não foi compartilhada com essa pessoa com permissão de edição (Parte 1).
- **Tela "Falta configurar o app":** os IDs da Parte 4 não foram preenchidos.
- **Envio lento no 4G:** fotos originais são grandes. Se quiser mais velocidade, troque `reduzirFotos: false` por `true` no CONFIG.
