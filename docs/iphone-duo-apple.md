# iPhone Duo — o que a Apple pede (resumo)

Resumo em português, com as nossas palavras, da página **"Designing for iPhone Duo"** das Human Interface Guidelines da Apple
(https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo — página nova de 09/09/2026, lida em
15/11/2026 pelo arquivo de dados `https://developer.apple.com/tutorials/data/design/human-interface-guidelines/designing-for-iphone-duo.json`,
porque a página é montada por JavaScript). Pedido do Gustavo em 15/11/2026: "aprenda o que está aí e salve no projeto".
Se a Apple mudar a página, ler de novo pelo mesmo arquivo `.json` e atualizar aqui.

## O aparelho

- Duas telas, cada uma com a sua câmera frontal, e uma dobradiça no meio. **Tela de fora** (fechado) e **tela de dentro** (aberto).
- **Câmera da tela de fora**: fica **num canto** e está **sempre à vista**, alinhada na vertical com a coluna de controles do lado.
  Ela vira a Dynamic Island quando há Atividades ao Vivo.
- **Câmera da tela de dentro**: fica atrás da tela e só aparece quando está em uso (aí a interface abre espaço para ela).
- **Posições**: meio dobrado como um livro, apoiado numa mesa, em pé sobre a borda. **Não** se faz um layout para cada posição:
  são só dois casos — **largura compacta** (tela de fora) e **largura normal** (tela de dentro) — e o layout cresce com o espaço.
- Continua sendo um iPhone: as regras gerais do iOS continuam valendo.

## Boas práticas

1. **App que muda de tamanho**: duas telas, várias posições e a tela dividida (Split View) fazem o app aparecer em muitos tamanhos.
   Usar margens e áreas protegidas (safe areas); **evitar larguras fixas** e coisas presas a uma tela específica.
2. **A mesma experiência nas duas telas**: mesmas funções e o mesmo estado ao abrir e fechar. Na tela de dentro pode aparecer
   **um nível a mais** (ex.: o Mail mostra a lista *ou* o e-mail fechado, e **os dois lado a lado** aberto).
3. **As mesmas funções em todas as posições**: controles podem ir para um menu de "mais" e o conteúdo pode mudar de tamanho,
   mas nada pode sumir.
4. **Seguir a disposição vertical do sistema** para barras de ferramentas, **barra de abas** e navegação (ver abaixo).
5. Jogos: funcionar em todas as posições, preencher a tela.

## Layouts que se adaptam

- **Regiões reservadas** (onde o conteúdo não deve ficar por cima):
  - a **câmera da tela de fora** (sempre presente; cresce com a Dynamic Island);
  - a **câmera da tela de dentro** (só quando ligada);
  - a **região da dobra** (só com o aparelho meio dobrado: divide a tela de dentro em duas partes e o meio não deve ter nada importante).
- Alertas, menus e janelas do sistema já fogem da dobra. Com o aparelho meio dobrado, os painéis lado a lado ajustam a largura
  para cada lado ficar inteiro à vista.
- **Grades: preferir número par de colunas**, para a dobra cair entre colunas.
- **Mudanças pequenas ao dobrar**: mexer só no necessário; controles que somem ou pulam de lugar confundem.
- **Lista + detalhe** (split view): dois painéis na tela de dentro, um só na de fora.
- **"Arrangement views"** (recurso nativo): dois blocos que ficam lado a lado na tela larga e um em cima do outro na tela alta;
  ou um por cima do outro que se separam quando o aparelho é meio dobrado. A navegação fica **fora** desses blocos.

## Controles na vertical (o padrão mais importante do Duo)

- **Barras de ferramentas, barra de abas e botões de navegação**, que nos outros iPhones ficam em cima e embaixo,
  **vão para uma coluna do lado** — mais espaço na vertical para o conteúdo e controles perto do polegar.
- Vale para a **tela de fora** e para a **tela de dentro deitada** (para não mudar de lugar ao abrir).
  **Exceção: tela de dentro em pé** — tem altura de sobra e **mantém as barras normais** (em cima e embaixo).
- A coluna junta coisas do sistema e do app: **Dynamic Island, barra de status (hora/bateria), barra de ferramentas
  (com o Voltar) e barra de abas**.
- Com dois apps lado a lado na tela de dentro, cada um põe a coluna na sua borda de fora (o da esquerda, à esquerda).
- A coluna fica sempre do mesmo lado do aparelho (alinhada com a câmera), mesmo em idiomas da direita para a esquerda.
- **Layout assimétrico**: os controles ficam de um lado só; usar as áreas protegidas para nada ficar embaixo deles.
- **Ordem na coluna**: **no alto, a navegação principal (Voltar, Fechar)**, logo depois a ação de destaque (ex.: Concluído);
  o resto continua nos grupos de antes, com um espaço separando o que vinha da barra de cima e o que vinha da de baixo.
- **Prioridade**: quando falta espaço, os itens vão para o menu "mais" de baixo para cima. Manter à vista as ações mais usadas
  (ex.: **escrever** no Mail, **nova nota** no Notas) e os itens com número/aviso.
- **Não mudar a posição padrão das barras**: a coluna vertical é a marca do Duo.
- Telas sem barras (visuais, sem rolagem — ex.: Calculadora) podem usar a largura toda, sem conflito com a Dynamic Island e a hora;
  dá para misturar: fundo/cabeçalho na largura toda e o conteúdo que rola recuado.
- **Agrupar** os botões em vez de espaçar à mão.
- **Controles perto do conteúdo que afetam**: o que é da lista fica em cima da lista (não vai para a coluna).
- **Cada botão com título e ícone**; **poucos botões só de texto** — botões com texto ficam numa barra horizontal; preferir ícone.
- **Pouco espaço**: em telas de navegação, os botões da barra de ferramentas vão para o menu "mais" e a barra de abas fica;
  em telas de tarefa (preencher algo), a barra de abas é minimizada e ficam os botões da tarefa.
- **Menu "mais"**: usar o do sistema; o símbolo de reticências (…) só para ele.

## O que isso quer dizer para o VPX Visitas (app web)

O app é uma página web na tela inicial: **não tem** os componentes nativos que fazem isso sozinhos, nem acesso às "regiões
reservadas" e à dobra (o Safari não informa onde fica a dobra). O que dá para seguir, e onde está no app (atualizado em 15/11/2026):

| Regra da Apple | No app (15/11/2026) |
|---|---|
| Dois casos (estreita/larga), sem medidas fixas | Layout largo de toque a partir de 560/840 px — são medidas fixas, inevitáveis em CSS |
| Nada embaixo da câmera / coluna | `--faixa` afasta topo, conteúdo, barras e janelas da borda direita (`html.duo`) |
| Voltar no alto da coluna, logo depois a ação de destaque, "nova" sempre à vista | `#duo-faixa`: Voltar no alto e "+" logo abaixo (`pintarFaixaDuo`) |
| Barra de abas também na coluna (fechado e aberto deitado) | Feito em 15/11/2026: abas numa cápsula de vidro embaixo da coluna (`.df-abas`); a barra de baixo some |
| Aberto **em pé**: barras normais, sem coluna | Feito em 15/11/2026: coluna só com `html.duo-col` (deitado ou até 559 px) |
| Tela de dentro com um nível a mais (lista + detalhe) | **Ainda não** (proposto como passo 3) |
| Grades com número par de colunas | Quadrados em `auto-fill` (pode dar número ímpar) |
| Ícone + título em cada botão; poucos botões de texto | Botões da coluna com ícone e `aria-label`/`title`; "Hoje" e outros textos ficam no topo |
