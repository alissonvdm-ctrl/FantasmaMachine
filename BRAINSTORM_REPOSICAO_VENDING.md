# BRAINSTORM: Sistema de Registro de Reposição em Vending Machine

> Exploratory session to clarify intent and approach before requirements capture

## Metadata

| Attribute | Value |
|---|---|
| Feature | REPOSICAO_VENDING |
| Date | 2026-09-08 |
| Author | brainstorm-agent |
| Status | Handoff Ready |

## Initial Idea

**Raw Input:** "Temos uma máquina de vendas autônoma, ela tem um sistema para controle de estoque do que está nas molas e em seu compartimento lateral, a pessoa que abastece é diferente da que alimenta o sistema, estou precisando de um sistema web online que facilite essa transferência de informação. Algo que ele só clica, meio padronizado, ainda tem a questão de trocar o produto da mola, esse detalhe também tem que ser informado."

**Context Gathered:**
- O ERP de destino é o da VendPago, acessado em `erpvending.com.br`.
- A máquina possui terminal VendPago com telemetria vinculada.
- O compartimento lateral é o estoque interno da máquina; o abastecedor retira de lá para encher as molas.
- Os produtos vêm sempre de uma lista fixa cadastrada previamente — não há cadastro de produto novo em campo.
- Existe um app oficial (Vendpago PDA) que já faria abastecimento e inventário, mas foi descartado: o sistema é complexo e demorado, e o abastecedor faz a reposição rápido e vai embora.
- O usuário possui o mapa das molas (quais existem e o que há em cada uma).

**Technical Context Observed (for Define):**

| Aspect | Observation | Implication |
|---|---|---|
| Likely Location | Projeto novo, sem base de código existente | Greenfield; escolha livre de stack |
| Relevant KB Domains | Base pública VendPago (telemetria, definições de estoque, importação CSV de produtos) | Nomenclatura de molas/produtos deve espelhar o VendPago |
| Integração | Nenhuma API pública documentada da VendPago | Automação de navegador (somente leitura) como substituto; API a confirmar com o suporte |
| IaC Patterns | N/A | Backend com navegador headless exige VPS/container, não hospedagem estática |

## Discovery Questions & Answers

| # | Question | Answer | Impact |
|---|---|---|---|
| 1 | Qual o problema que mais dói hoje? | Retrabalho: quem alimenta o sistema precisa perguntar/adivinhar o que foi feito | Define o produto como tradutor entre duas pessoas, não como controle de estoque |
| 2 | Onde e quando o abastecedor registra? | No celular, na frente da máquina, durante o abastecimento | Exige UI de toque grande, tolerante a sinal instável |
| 3 | O que é o sistema de estoque de destino? | Software de terceiros (VendPago), só digitação manual na tela | Sem integração de escrita; a saída do sistema é um roteiro de digitação |
| 4 | De onde vem o produto novo numa troca de mola? | Sempre de lista fixa cadastrada antes | Elimina cadastro em campo; troca vira seleção em lista |
| 5 | O que é o compartimento lateral? | Estoque interno — o abastecedor tira de lá para encher as molas | Um evento de abastecimento afeta dois saldos; controle do lateral fica no VendPago |
| 6 | Quando o robô escrever no VendPago, como deve funcionar? | Não deve alterar nada; somente leitura, exibindo o estoque no sistema novo | Elimina risco de corromper dados de produção |
| 7 | Com que frequência o robô lê o estoque? | Automático, algumas vezes ao dia | Exige agendador (cron/job queue) no backend |

## Sample Data Inventory

| Type | Location | Count | Notes |
|---|---|---:|---|
| Input files | Mapa das molas (posse do usuário) | 1 | Não anexado nesta sessão; será o seed do planograma |
| Output examples | Relatório de estoque do VendPago (export CSV/PDF ou print) | 0 | Solicitado; pendente de envio |
| Ground truth | N/A | 0 | — |
| Related code | N/A | 0 | Projeto greenfield |

**How samples will be used:**
- O mapa das molas define a estrutura do planograma visual (posições, produtos, capacidades).
- O relatório de estoque do VendPago define a nomenclatura de molas e produtos, que deve ser espelhada para evitar tradução mental de quem digita.
- Ambos devem ser anexados antes ou durante a fase `/define`.

## Approaches Explored

### Approach A: PWA com Planograma Visual + Robô de Leitura — Recommended

**Description:** Aplicação web responsiva (desktop para gestão, celular para campo). O abastecedor vê a máquina desenhada como grade de molas, toca em uma mola e informa a quantidade inserida por botões grandes; a troca de produto abre a lista fixa. Molas não tocadas são interpretadas como não mexidas. Ao fechar a visita, o sistema gera um roteiro ordenado de digitação. Em paralelo, um robô de navegador headless lê o estoque do VendPago algumas vezes ao dia e alimenta a visão de estoque interna, sem nunca escrever no ERP.

**Pros:**
- Ataca a dor exata: o retrabalho vira instrução pronta.
- Velocidade de campo compatível com um abastecedor apressado — sem texto livre, sem decisões.
- A diferença entre o estoque lido do VendPago e as visitas registradas no app vira, de graça, um indicador de pendência de digitação.
- Somente leitura: falha do robô degrada a tela, não corrompe o ERP.

**Cons:**
- Exige planograma cadastrado e mantido em sincronia com o VendPago.
- Erro de toque do abastecedor propaga silenciosamente (sem recontagem no v1).
- Backend com navegador headless custa mais infra que um PWA estático.
- Scraping quebra quando o VendPago mudar layout.

**Why Recommended:** Confirmado pelo usuário. O destino só aceita digitação manual, então o produto que resolve a dor não é um controle de estoque paralelo, e sim um roteiro de digitação confiável somado a uma visão de estoque sempre à mão.

### Approach B: Contagem de Estado Final

**Description:** Em vez de registrar quanto colocou, o abastecedor informa quantas unidades ficaram em cada mola.

**Pros:**
- Autocorretivo: cada visita reancora o estoque na realidade física, eliminando drift acumulado.

**Cons:**
- Obriga contar todas as molas, inclusive as não tocadas — lento no campo, contrário ao requisito de velocidade.

### Approach C: Usar o Vendpago PDA (não construir nada)

**Description:** Cadastrar o abastecedor como funcionário no VendTEF e treiná-lo no app oficial, eliminando o intermediário.

**Pros:**
- Custo zero de desenvolvimento; elimina a segunda digitação por completo.
- Pré-condição técnica atendida (máquina com telemetria vinculada).

**Cons:**
- Rejeitado pelo usuário: o sistema é complexo e demorado para um abastecedor que quer sair rápido.
- Indício (não verificado) de que a troca de produto da mola é feita no portal, não no app.
- Dá acesso também a coleta financeira, sem controle de permissão confirmado.

## Selected Approach

| Attribute | Value |
|---|---|
| Chosen | Approach A — PWA com planograma visual + robô de leitura |
| User Confirmation | Confirmado na sessão de 2026-09-08 ("sim"), com ajuste posterior restringindo o robô a somente leitura |
| Reasoning | Único caminho que concilia velocidade de campo, ausência de API e não-corrupção do ERP de produção |

## Key Decisions Made

| # | Decision | Rationale | Alternative Rejected |
|---|---|---|---|
| 1 | Construir sistema próprio em vez de usar o Vendpago PDA | App oficial é lento demais; sistema não usado não resolve nada | Approach C |
| 2 | Registrar quantidade inserida, não contagem final | Velocidade de campo é requisito duro | Approach B |
| 3 | Robô de navegador somente leitura | Falha degrada a tela em vez de gravar estoque errado em produção | Escrita automatizada no ERP |
| 4 | Roteiro de digitação permanece mesmo com o robô | É a saída principal, já que o robô não escreve | Depender só da automação |
| 5 | Exibir lado a lado o estoque do VendPago e as visitas não digitadas | A divergência vira indicador de pendência | Mostrar um número único |
| 6 | Sincronização automática algumas vezes ao dia | Equilíbrio entre frescor do dado e carga no ERP | Sob demanda / a cada visita |
| 7 | Nomenclatura de molas e produtos espelha o VendPago | Evita tradução mental de quem digita, que reintroduz o retrabalho | Nomenclatura própria |

## Features Removed (YAGNI)

| Feature Suggested | Reason Removed/Deferred | Can Add Later? |
|---|---|---|
| Cálculo do saldo do compartimento lateral | Controle é do VendPago; dois números divergiriam | Yes |
| Botão de recontagem de mola | Introduz segundo modelo mental para usuário apressado | Yes |
| Coleta financeira | Fora do problema; o PDA já cobre | No |
| Múltiplas máquinas e rotas | Há uma máquina hoje | Yes |
| Histórico com gráficos e relatórios analíticos | Não ataca a dor central | Yes |
| Alertas de ruptura de estoque | Prematuro antes de dados confiáveis | Yes |
| Foto da mola / anexos | Sem valor demonstrado | Yes |
| Cadastro de produto novo em campo | Lista fixa confirmada pelo usuário | Yes |
| Escrita automatizada no VendPago | Risco de corromper estoque de produção | Yes (v2, condicionado) |

## Incremental Validations

| Section | Presented | User Feedback | Adjusted? |
|---|---|---|---|
| Checkpoint 1 — conceito, três partes e responsabilidades | Yes | Usuário redirecionou para automação de navegador em vez de validar diretamente | Yes |
| Checkpoint 2 — arquitetura com robô, riscos e alternativas | Yes | Restringiu o robô a somente leitura; definiu sincronização automática algumas vezes ao dia | Yes |

## Suggested Requirements for /define

### Problem Statement (Draft)

Quem abastece a vending machine e quem lança o estoque no ERP são pessoas diferentes, e a informação sobre quantidades repostas e trocas de produto nas molas chega incompleta, obrigando quem digita a perguntar ou adivinhar o que foi feito.

### Target Users (Draft)

| User | Pain Point |
|---|---|
| Abastecedor (campo, celular) | Precisa registrar rápido e sair; qualquer sistema lento é abandonado na prática |
| Operador/gestor (digita no VendPago) | Reconstrói a visita por dedução; não sabe o que foi reposto nem o que teve troca de mola |

### Success Criteria (Draft)

- [ ] O abastecedor conclui o registro de uma visita completa em tempo compatível com sua rotina (meta numérica: **TBD** — medir a visita atual como baseline)
- [ ] Zero perguntas do operador ao abastecedor após uma visita registrada
- [ ] Toda troca de produto em mola é registrada e aparece no roteiro de digitação
- [ ] O roteiro de digitação lista apenas as molas alteradas, em ordem de posição
- [ ] A tela de estoque indica a idade da última sincronização e as visitas ainda não digitadas

### Constraints Identified

- O ERP VendPago não possui API pública documentada; escrita permanece manual.
- O robô de leitura precisa armazenar credencial com acesso à conta inteira, incluindo coleta financeira.
- Scraping depende de HTML de terceiro, sujeito a mudança sem aviso.
- Backend com navegador headless exige VPS/container, não hospedagem estática gratuita.
- Registro ocorre na frente da máquina, com possibilidade de sinal instável.
- Nomenclatura de molas e produtos deve espelhar o VendPago.

### Open Dependencies (resolver antes do Build)

- **Termos de uso da VendPago:** verificar se há cláusula proibindo acesso automatizado. Risco de suspensão da conta que opera a máquina.
- **Suporte VendPago:** confirmar existência de API, exportação agendada ou importação de inventário por CSV. Qualquer uma delas substitui o robô com menos risco.
- **Amostras:** anexar o mapa das molas e um export/print do relatório de estoque.
- **2FA/captcha no login do VendPago:** se existir, inviabiliza o robô.

### Out of Scope (Confirmed)

- Escrita automatizada no ERP VendPago.
- Cálculo próprio do saldo do compartimento lateral.
- Coleta financeira e conciliação de valores.
- Gestão de múltiplas máquinas ou rotas.
- Cadastro de produtos novos em campo.
- Substituição do VendPago como sistema de registro oficial.

## Session Summary

| Metric | Value |
|---|---:|
| Questions Asked | 7 |
| Approaches Explored | 3 |
| Features Removed (YAGNI) | 9 |
| Validations Completed | 2 |

## Next Step

Execute o **SDD Define by RDD**.
