# VPX Engenharia (app VPX Visitas): estado do projeto

Resumo em 18/10/2026. Detalhes técnicos de cada função estão no `CLAUDE.md`.

- **Site do app:** https://vpxengenharia.github.io/vpx-visitas/
- **Código:** https://github.com/vpxengenharia/vpx-visitas (branch `main`)
- **Dados:** tudo fica no OneDrive do Gustavo, em `VPX Engenharia - AVCB`, compartilhado com a equipe. O app não tem banco de dados próprio.

---

## 1. O que o app faz hoje

### Navegação
- **Barra de baixo** com 5 seções: **Início · Clientes · Agenda · Financeiro · Mais**.
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
- **Página do cliente:**
  - situação do AVCB;
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
- **Pedidos de compra e de pagamento**, com aprovação, acompanhamento e planilha.

### Outros
- **Agenda do Outlook:** ver a agenda; criar compromissos com convidados e link do Teams; editar e cancelar os que a pessoa criou; compartilhar pelo WhatsApp.
- **Validade AVCB/CLCB:** fotografar o AVCB com leitura automática do texto.
- **ITs do CBM-BA:** funcionam sem internet, com busca por palavra.
- **Arquivos e histórico do cliente.**
- **Visualizador de PDF:** zoom e arrasto com a pinça dos dedos.
- **Administração:** permissões por pessoa e perfil padrão.
- **Celular:** sem zoom de dois toques; nome "VPX Engenharia" no ícone.

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

---

## 3. O que falta / pendências

### Testar no celular (feito só no navegador do computador, sem login)
- **Ordens de serviço** com OneDrive real: criar, pegar, executar e ver a baixa automática. Também conferir se a pasta `00 - Ordens de Serviço` foi criada.
- **Extintores e mangueiras:** primeiro cadastro real. Conferir se a pasta `00 - Extintores e Mangueiras` foi criada.
- **Páginas de cada assunto:** a lista "Últimos gerados" usa a busca do OneDrive. Ela pode demorar alguns minutos para achar arquivos novos e não foi testada com os arquivos reais.
- **Relatório de serviço e Aviso ao cliente:** envio e compartilhamento reais.
- **Agenda (criar compromisso):** no primeiro uso, autorizar a permissão `Calendars.ReadWrite` marcando "Consentir em nome da organização". Depois, criar um compromisso com convidado e link do Teams, editar e cancelar.

### Configurar
- Em **Mais › Administração**, ligar **"Criar ordens de serviço"** para quem do escritório vai abrir OS.
- Os técnicos precisam abrir o app pelo menos uma vez para aparecer na lista de "Direcionar a" das OS.

### Combinado para depois
- **"Pausar" no Relatório de Serviço:** continuar outro dia ou em outro celular, como nos laudos.

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
3. Nos celulares: fechar e abrir o app para pegar a versão nova.
