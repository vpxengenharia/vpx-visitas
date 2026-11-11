# VPX Engenharia (app VPX Visitas): estado do projeto

Resumo em 18/10/2026. Detalhes técnicos de cada função estão no `CLAUDE.md`.

- **Site do app:** https://vpxengenharia.github.io/vpx-visitas/
- **Código:** https://github.com/vpxengenharia/vpx-visitas (branch `main`)
- **Dados:** tudo fica no OneDrive do Gustavo, em `VPX Engenharia - AVCB`, compartilhado com a equipe. O app não tem banco de dados próprio.

---

## 1. O que o app faz hoje

### Navegação
- **Barra de baixo (celular)** com 5 seções: **Início · Clientes · Registros · Agenda · Mais**. No Mais ficam o Financeiro, **Tarefas e Funil comercial** (desde 07/11/2026), as ITs, a Administração e a conta.
- **No computador** a barra vira um menu lateral **sem o Mais** (desde 06/11/2026): **Início · Clientes · Registros · Agenda · Tarefas · Funil comercial · Financeiro · ITs do CBM-BA · Administração** e, embaixo, a conta com **Sair da conta**.
- **Topo:** a logo da VPX no centro e o aviso "⏳ X na fila" quando há envios pendentes.
- **Início:**
  - saudação;
  - **Continuar de onde parou** (documentos em andamento);
  - cartão de **Ordens de serviço**;
  - quadrados de **Registros**;
  - agenda de **hoje e amanhã**;
  - alertas de **AVCB** e de **extintores e mangueiras**.
- **Quadrados de Registros:** cada um abre primeiro a **página do assunto**, com:
  - **+ Novo…**;
  - o que está em andamento;
  - as OS abertas daquele tipo;
  - os **últimos documentos gerados** de todos os clientes.

  **OS** abre a fila de ordens de serviço. **Comprovante** abre o Financeiro.
- **Formulários:** abrem em tela cheia. O "voltar" leva à tela de onde vieram.
- **Aba Clientes (desde 07/11/2026):** tabela como planilha, igual às de notas fiscais e validade AVCB: cliente, CNPJ, situação do AVCB, extintores e mangueiras e contato principal, com busca (nome, CNPJ, contato), filtros, ordem pela coluna e exportação para o Excel. Tocar na linha abre a página do cliente; o "‹ Clientes" volta para o mesmo ponto da lista.
- **Página do cliente:**
  - situação do AVCB;
  - contatos da ficha do cliente (Ligar, WhatsApp, E-mail);
  - Arquivos, Pasta técnica, Histórico e Laudos salvos;
  - Extintores e mangueiras;
  - Avisar cliente;
  - OS abertas;
  - "Novo para este cliente".

### Registros de campo
| Assunto | O que gera | Onde salva (pasta do cliente) |
|---|---|---|
| Visita técnica | Fotos e vídeos | `06 - Fotos e Visitas Técnicas` |
| Comercial | Ficha → PDF "Relatório de Visita" | `06 - Fotos e Visitas Técnicas` |
| Laudo (Hidrantes, Elétrica, Alarme, Gás, Gerador, SPDA, Aterramento) | PDF do laudo, mais planilha e lista de serviços quando há não conformidades | `Laudos Técnicos` e `02 - Orçamento` |
| Inspeção (15 sistemas) | PDF "Relatório de Inspeção" | `Relatórios de Inspeção` |
| Brigada (4 modelos) | Lista de presença e certificados | `Treinamentos de Brigada` |
| Serviço | PDF "Relatório de Serviço" (atividades com fotos antes e depois, materiais, assinaturas) | `Relatórios de Serviço` |

**Recursos dos laudos e inspeções:**
- "Tudo conforme" por seção e barra de progresso;
- datas das visitas;
- **Pausar e continuar depois**, inclusive em outro celular;
- **reabrir um laudo concluído**: o PDF novo substitui o antigo.

**Cópia na Pasta técnica CBM-BA:** laudos, inspeções, treinamentos e relatórios de serviço entram nela sozinhos.

**Sem internet:** tudo fica guardado no celular e sobe sozinho quando o sinal volta.

### Ordens de serviço (OS)
- **Quem cria:** o escritório, com a função "Criar ordens de serviço". A OS tem cliente (escolhido na lista), serviço, descrição, prioridade, data prevista e técnico (ou "qualquer técnico").
- **A fila:** Fila / Minhas / Em andamento / Concluídas. O técnico **pega** e **executa**.
- **Ao executar:** o app abre o documento certo já preenchido. Quando o PDF é gerado, a OS fica **concluída sozinha**.
- **Recarga, troca ou teste:** ao concluir, o app pergunta se atualiza o controle de extintores e mangueiras do cliente.

### Extintores e mangueiras
- **Controle por grupo** em cada cliente, por exemplo "8 × Pó químico ABC 4 kg".
- **Prazos:** recarga a cada 12 meses e teste hidrostático a cada 5 anos (extintores); teste/manutenção a cada 12 meses (mangueiras).
- **Cores:** vermelho = vencido, amarelo = vence em até 60 dias.
- **Visão geral:** lista de vencimentos de todos os clientes (Mais › Extintores e mangueiras) e planilha.

### Aviso ao cliente
- **📣 Avisar cliente:** mensagem pronta (WhatsApp, e-mail) com o que está vencido ou a vencer, a frase sobre o risco à segurança e ao AVCB e os contatos da VPX.
- **📄 Situação em PDF:** documento com AVCB, extintores, mangueiras e "o que precisa ser feito".

### Financeiro
- **Comprovantes** de compra e reembolso, com **valor obrigatório**.
- **Histórico de comprovantes:** cada um vê os seus, o administrador vê todos. Mostra o total do mês e exporta planilha.
- **Pedidos de compra e de pagamento**, com aprovação, acompanhamento e planilha. No pedido de pagamento, **favoritos e recentes**: um toque preenche nome, chave PIX ou conta, centro de custo e descrição; falta só o valor (desde 30/10/2026). Permissão **"Realizar pagamentos"** (ex.: Raquel): vê os pedidos de pagamento de todos e marca os aprovados como pagos, com comprovante (desde 30/10/2026).

### Outros
- **Agenda do Outlook:** em calendário desde 10/11/2026 (o mês em cima e, embaixo, os compromissos do dia tocado; dá para ir um ano para trás e um ano para a frente); ver a agenda; criar compromissos com convidados e link do Teams; editar e cancelar os que a pessoa criou; compartilhar pelo WhatsApp.
- **Validade AVCB/CLCB:** fotografar o AVCB ou enviar o **PDF** do documento (desde 04/11/2026), com leitura automática do texto e os campos preenchidos sozinhos. No computador dá para arrastar o PDF para a tela. **Desde 07/11/2026 a lista é uma tabela como planilha**, igual à das notas fiscais: estabelecimento, tipo, CNPJ, validade e situação (vencido / a vencer / em dia), com busca, filtros de situação e categoria, ordem pela coluna e exportação para o Excel. Tocar na linha mostra o endereço, o CNPJ, quem registrou e os botões para ver o documento, abrir o mapa e ir à página do cliente; o "voltar" de lá volta para a tabela como estava.
- **Orçamentos (desde 05/11/2026):** todos os orçamentos de todos os clientes numa tabela, como planilha (Registros › Orçamentos, ou a página do cliente): número, cliente, tipo, **valor** e data, lidos de dentro de cada PDF. Busca, filtros por período e tipo, ordem tocando no título da coluna, total do que está filtrado, abrir o PDF, **compartilhar com o cliente** (WhatsApp, e-mail…), abrir a planilha e exportar para Excel. Só aparece para quem tiver a função "Orçamentos" liberada na Administração (o administrador vê sempre). Os valores lidos ficam em `VPX Visitas - Configuração/orcamentos.json`, para os outros aparelhos não precisarem baixar os PDFs.
- **Notas fiscais (desde 06/11/2026):** todas as notas emitidas aos clientes numa tabela como a dos orçamentos (Registros › Notas fiscais, ou a página do cliente): número, cliente, orçamento, valor e emissão, com busca, filtros por período e situação (canceladas, ISS retido, com boleto, nacionais, antigas), total sem as canceladas e exportação para Excel. Entram as **antigas da Nota Salvador** (NF 090 a 245; são imagens, lidas pela leitura de imagem do próprio app) e as **nacionais (NFS-e)**, com os **boletos** ligados pelo número da nota. Cada nota tem "Enviar nota e boleto ao cliente" (WhatsApp, e-mail…) e, para o administrador, "Corrigir os dados". **"+ Nova nota fiscal":** escolher o PDF da nota, o app preenche tudo, juntar o boleto e salvar na pasta `06 - Comercial › 04 - Notas Fiscais e Boletos` com o nome no padrão (`NF 007 - C1034.pdf`); o boleto `NFxxx` da mesma parcela, se já estiver na pasta, ganha o número da nota. Só aparece para quem tiver a função "Notas fiscais" (o administrador vê sempre). Os dados lidos e as correções ficam em `VPX Visitas - Configuração/notas-fiscais.json`.
- **Ficha do cliente (desde 06/11/2026):** dados e contatos de cada cliente (síndico, administradora, zelador, portaria, financeiro…), com **Ligar, WhatsApp e E-mail** num toque. Aparece na página do cliente (os 2 primeiros contatos), no atalho "Contatos" dos formulários e no detalhe da OS. Dados: razão social, CNPJ/CPF, tipo, endereço (abre no mapa), acesso e observações. A busca da aba Clientes também acha o cliente pelo nome do contato, telefone, e-mail ou CNPJ, e no fim da aba Clientes dá para exportar os contatos de todos para o Excel. Fica em `02 - Clientes › 00 - Fichas dos Clientes` (um arquivo por cliente) e dá para ver sem internet; para salvar precisa de internet. Toda a equipe vê e edita (função "Ficha do cliente", já liberada no perfil padrão e para a equipe de campo).
- **Tarefas e funil comercial (desde 07/11/2026):** como no monday.com, mais simples. Tarefas da equipe em lista ou quadro (responsáveis, prazo, prioridade, subtarefas e comentários) e o funil com as etapas do monday, valores, registro de ligações e tarefas de cada oportunidade (o que estava no monday foi importado). No celular ficam no **Mais**, em **Registros** e no **Início**; no computador, no menu lateral. O funil só aparece para quem o Gustavo liberar (tem os valores).
- **Versão nova do app (desde 08/11/2026):** o app confere sozinho se há versão nova publicada (ao abrir, ao voltar para ele e a cada 30 min). Se a pessoa está no Início, em Registros ou no Mais, sem nada aberto nem em andamento, ele recarrega na hora; nas outras telas aparece embaixo "Há uma versão nova do app" com o botão **Atualizar**. Publicar só as anotações não conta como versão nova.
- **"O que o cliente tem" (desde 11/11/2026):** na ficha de cada cliente dá para marcar o que a edificação tem (gás e tipo, gerador, escadas, hidrantes com ou sem bomba, sprinklers, alarme, SPDA, iluminação de emergência, portas corta-fogo, pressurização, elevadores, além de torres, pavimentos, garagens, unidades e área). Aparece em etiquetas na página do cliente, vira filtro na aba Clientes ("Com gerador", "Com gás GLP"…) e sai na planilha. O levantamento comercial preenche sozinho o que ainda estiver vazio. Toda a equipe pode preencher.
- **Ajustes aprovados em 11/11/2026:** no celular, os formulários mostram o "voltar" e o título na faixa do topo (mais tela para preencher) e as listas (Tarefas, Funil, OS, AVCB, Orçamentos, Notas…) mantêm a barra de baixo à vista; a opção marcada passou a ser azul (o laranja fica para o botão principal); as assinaturas dos formulários são feitas numa tela cheia ("Toque para assinar"); no computador, a logo foi para o alto do menu lateral (sem a faixa do topo) e o Início virou um painel com os números do dia.
- **Prazos do AVCB mais fáceis de ler (desde 11/11/2026):** "vencido há quase 3 anos" ou "faltam 10 meses" no lugar de "há 1.090 dias" / "faltam 296 dias"; até 90 dias continua em dias.
- **No computador (desde 10/11/2026):** Agenda com o calendário à esquerda e os compromissos do dia à direita; aba Clientes com título, busca, filtros e resumo ocupando menos espaço; quadros de Tarefas e do Funil com as colunas alinhadas; nos formulários, "Escolher arquivos" em destaque e a barra de baixo numa linha só; atalhos Ctrl+K (ir para um cliente) e "/" (busca).
- **Uso mais fluido (desde 10/11/2026):** ao voltar de uma tarefa, oportunidade, OS, pedido ou nota, a lista aparece no mesmo ponto; as perguntas que apagam trabalho e as datas (pasta técnica, pedidos) usam a janela do próprio app, com calendário, em vez da caixinha do navegador; a assinatura ignora toque sem querer; aparece "Sem internet" no alto mesmo sem nada na fila; a grade de fotos não pisca mais durante o envio; na Agenda dá para trocar de mês deslizando o dedo.
- **Visual mais moderno (desde 10/11/2026):** faixa do topo mais baixa no celular (sobra mais tela para o conteúdo), cartões com contorno fino e sombra suave, títulos e rótulos mais fortes, aba marcada mais visível na barra de baixo, etiquetas de situação do mesmo tamanho, lupa nos campos de busca e telas que entram com um movimento curto em vez de um corte seco.
- **Segurança do trabalho de campo (desde 09/11/2026, pacote 1 da revisão de design):** "Desfazer" ao tirar foto, vídeo ou PDF e no "Tudo conforme"; cancelar OS, compromisso ou pedido numa janela do app com botões que dizem o que fazem; o "voltar" do Android volta para a lista em vez de fechar o app; erros em português. O pacote 2 (mesmo dia) cuidou do uso no sol, com uma mão: botões que escurecem ao tocar, alvos de toque maiores, contorno dos campos mais marcado, Câmera em destaque e modo escuro com o topo escuro. O pacote 3 (10/11/2026) organizou as telas: no Início, botão "Fotografar visita", clientes recentes, as OS listadas e avisos menos vermelhos; na página do cliente, "Novo para este cliente" logo abaixo do nome; Registros em três grupos; no celular, filtros numa linha só que rola de lado.
- **ITs do CBM-BA:** funcionam sem internet, com busca por palavra.
- **Arquivos e histórico do cliente.**
- **Visualizador de PDF:** zoom e arrasto com a pinça dos dedos.
- **Administração:** permissões por pessoa e perfil padrão.
- **Equipe de campo com e-mail pessoal (desde 24/10/2026):** a pessoa toca em "Pedir acesso" na entrada do app, faz o cadastro na página da Microsoft (e-mail pessoal + código, nome e função) e fica na tela de espera. O administrador vê o pedido em Mais › Administração e toca em Liberar (o app compartilha as pastas e grava as funções) ou Recusar; depois dá para Remover acesso. Sem caixa de e-mail da VPX e sem custo. Quem entra assim não vê a Agenda.
- **Celular:** sem zoom de dois toques; nome "VPX Engenharia" no ícone.
- **Computador (Chrome no PC, desde 24/10/2026):** menu lateral fixo no lugar da barra de baixo, telas largas com quadrados e listas em colunas, Início em duas colunas (agenda à direita), Esc fecha a tela aberta por cima e dá para arrastar fotos e PDFs para os formulários. No celular nada mudou.

---

## 2. Decisões importantes (tomadas pelo Gustavo)

- **Não mudar o endereço do site nem o registro no Microsoft Entra.** O nome "VPX Visitas" continua no endereço, no repositório e na pasta `VPX Visitas - Configuração`, porque mudar quebraria o login e as permissões.
- **Itens dos laudos:** aprovados em 12/10/2026. Não alterar os existentes; o Aterramento foi acrescentado em 16/10/2026.
- **Laudo reaberto:** substitui o PDF anterior. O OneDrive guarda a versão antiga no histórico de versões.
- **Laudos não têm controle de validade próprio,** porque acompanham o AVCB. Extintores e mangueiras têm, **por grupo**.
- **Ordens de serviço:**
  - só quem tiver "Criar ordens de serviço" cria;
  - podem ir para um técnico ou para qualquer um;
  - **a baixa é feita pelo documento** (não existe baixa sem documento);
  - recarga, troca ou teste oferecem atualizar o controle de extintores e mangueiras.
- **Relatório de serviço:**
  - assinatura do cliente opcional;
  - pendências só como texto;
  - cópia na Pasta técnica.
- **Comprovantes:** valor obrigatório; cada um vê os seus e o administrador vê todos; todos podem exportar a planilha.
- **Funções novas** (Relatório de serviço, Extintores e mangueiras, Ordens de serviço) entram liberadas no perfil padrão. **"Criar ordens de serviço" não entra:** precisa ser liberada na Administração.
- **Navegação:** barra de baixo; cada quadrado do Início abre primeiro a página do assunto.
- **Topo:** só a logo no centro, sem as iniciais. A Agenda fica como as outras seções.
- **Contatos no aviso ao cliente:** WhatsApp (71) 99194-9900, contato@vpxengenharia.com.br e Instagram @vpxengenharia.
- **Agenda:** todos que têm a Agenda podem criar compromissos; cada um edita e cancela só os que criou; compartilhar = convite do Outlook e também WhatsApp/outros apps.
- **Notas fiscais (06/11/2026):** lista com filtros e total, cadastrar nota nova e enviar ao cliente; as notas antigas entram também. **Controle de recebimento (pago/em aberto) ficou de fora** por enquanto. Função "Notas fiscais" fora do perfil padrão.

---

## 3. O que falta / pendências

### Testar no celular (feito só no navegador do computador, sem login)
- **Versão nova sozinha (08/11/2026):** fechar e abrir o app uma vez no celular; depois de uma próxima publicação, deixar o app no Início, sair por uns minutos e voltar (ele deve recarregar sozinho), ou ver o aviso "Atualizar" nas outras telas. Testado só com publicações simuladas; conferir no iPhone e no Android.
- **Versão para computador:** abrir no Chrome do PC com o login real e passar pelas telas (testada só com dados de exemplo).
- **Ordens de serviço** com OneDrive real: criar, pegar, executar e ver a baixa automática. Também conferir se a pasta `00 - Ordens de Serviço` foi criada.
- **Extintores e mangueiras:** primeiro cadastro real. Conferir se a pasta `00 - Extintores e Mangueiras` foi criada.
- **Páginas de cada assunto:** a lista "Últimos gerados" usa a busca do OneDrive. Ela pode demorar alguns minutos para achar arquivos novos e não foi testada com os arquivos reais.
- **Relatório de serviço e Aviso ao cliente:** envio e compartilhamento reais.
- **Orçamentos:** abrir primeiro no computador (ele lê os valores de todos os PDFs uma vez, cerca de 1 a 2 minutos) e conferir se estão todos lá e se os valores batem com os PDFs. O app procura só nas pastas "02 - Orçamento" de cada cliente (fora as "Arquivo Morto") e só os arquivos com nome "VPX ENGENHARIA-ORÇ-…". Liberar a função "Orçamentos" na Administração para quem do escritório precisar.
- **Ficha do cliente:** cadastrar a ficha de um cliente real (pela página do cliente) e testar Ligar, WhatsApp e E-mail no celular. Conferir se a pasta `00 - Fichas dos Clientes` foi criada em 02 - Clientes. No Android, testar "Trazer da agenda do celular".
- **Notas fiscais:** abrir primeiro **no computador** e deixar a leitura terminar (as ~130 notas antigas são imagens: cerca de 8 minutos na primeira vez; continua mesmo saindo da tela, desde que o app fique aberto). Conferir os clientes e os valores; o que vier errado, corrigir em "Corrigir os dados desta nota". Depois, cadastrar uma nota nova real com o boleto e enviar ao cliente. Para outra pessoa usar: liberar a função "Notas fiscais" na Administração e compartilhar com ela a pasta `04 - Notas Fiscais e Boletos` no OneDrive.
- **AVCB em PDF:** enviar um PDF real do Corpo de Bombeiros e conferir se todos os campos vieram certos (testado só com PDFs de exemplo no mesmo formato).
- **Agenda (criar compromisso):** no primeiro uso, autorizar a permissão `Calendars.ReadWrite` marcando "Consentir em nome da organização". Depois, criar um compromisso com convidado e link do Teams, editar e cancelar.

### Configurar
- **Equipe de campo (pedidos de acesso):** configurado no Microsoft 365 e testado em 26/10/2026 (cadastro com e-mail do iCloud, liberação, entrada no app e uma OS pega, executada e concluída pelo convidado). Decisão do Gustavo: sem agenda para os técnicos por enquanto (compromissos podem ir por convite para o e-mail pessoal). Falta apagar os cadastros de teste ("Colaborador Teste" e "Funcionário Teste") quando não forem mais necessários: Remover acesso no app e excluir em Entra › Usuários.
- Em **Mais › Administração**, ligar **"Criar ordens de serviço"** para quem do escritório vai abrir OS.
- Os técnicos precisam abrir o app pelo menos uma vez para aparecer na lista de "Direcionar a" das OS.

### Combinado para depois
- **"Pausar" no Relatório de Serviço:** continuar outro dia ou em outro celular, como nos laudos.
- **Claude dentro do app** (conversado em 06/11/2026; o Gustavo decidiu deixar para depois):
  - **O que faria:** uma tela "Assistente" ou botões nos lugares certos para:
    - tirar dúvidas sobre as ITs, com a IT e a página;
    - escrever as observações e recomendações de laudos e inspeções;
    - montar o texto de orçamento a partir das não conformidades;
    - ler PDFs (AVCB, projeto, orçamento);
    - resumir a situação do cliente.
  - **Como montar:** o app não tem servidor, então a chave de acesso da Anthropic não pode ficar no app. Precisa de uma pequena função na nuvem (sugestão: Cloudflare, plano gratuito) que guarda a chave e só atende quem entrou com o login da VPX. Não precisa de permissão nova da Microsoft.
  - **Custo:** por uso, cobrado pela Anthropic. Com o Claude Opus 5.5: US$ 4 por milhão de tokens lidos e US$ 20 por milhão escritos. Uma pergunta com um PDF de poucas páginas fica em cerca de US$ 0,05 a 0,15. Há modelos mais baratos (Sonnet 5.5, Haiku 5.5).
  - **Fica com o Gustavo:** criar as contas da Anthropic (desenvolvedor) e da Cloudflare, cadastrar o cartão e gerar a chave. O Claude monta a função e a tela.
  - **Alternativa sem mexer no app:** usar o claude.ai com o conector do Microsoft 365 e pôr no app só um botão "Abrir o Claude".

### Ideias sugeridas (ainda não pedidas)
- **Proposta comercial em PDF** a partir do laudo ou da inspeção, com uma tabela de preços da VPX.
- **Registro de chegada com localização** no relatório de serviço e na visita.
- **Painel do administrador:** números do mês por colaborador e por cliente.
- **Relatório de serviço de recarga** atualizando os extintores sozinho, mesmo sem OS.

### Fora do app
- No **site da VPX**, o botão de ligar está com o número `+55 71 9919-4900`, faltando um dígito. O certo é (71) 99194-9900.

---

## 4. Como publicar uma mudança
1. Fazer a mudança num ramo separado e testar no navegador (tamanho de celular).
2. Juntar no `main` e enviar para o GitHub. O site atualiza em 1 a 2 minutos.
3. Nos celulares o app pega a versão nova sozinho (ao abrir, ao voltar para ele depois de uns minutos, ou pelo aviso "Atualizar"). Celular com o app aberto antes de 08/11/2026: fechar e abrir o app uma última vez.
