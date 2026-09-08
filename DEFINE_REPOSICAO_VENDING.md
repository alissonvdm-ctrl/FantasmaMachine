# DEFINE: Sistema de Registro de Reposição em Vending Machine

> Sistema web que transfere, sem ambiguidade, a informação de abastecimento e troca de mola entre quem repõe a máquina e quem lança o estoque no ERP VendPago.

## Metadata

| Attribute | Value |
|---|---|
| **Feature** | REPOSICAO_VENDING |
| **Date** | 2026-09-08 |
| **Author** | SDD Define by RDD |
| **Status** | Ready for Design |
| **Clarity Score** | 14/15 |

---

## Problem Statement

Quem abastece a vending machine e quem lança o estoque no ERP VendPago são pessoas diferentes, e a informação sobre quantidades repostas e trocas de produto nas molas chega incompleta ao operador, que precisa perguntar ao abastecedor ou deduzir o que foi feito. O app oficial do fornecedor resolveria a lacuna, mas é lento demais para um abastecedor que conclui a reposição em poucos minutos e vai embora.

---

## Target Users

| User | Role | Pain Point |
|---|---|---|
| Abastecedor | Repõe fisicamente as molas em campo, pelo celular, na frente da máquina | Precisa registrar rápido e sair; qualquer sistema lento é abandonado na prática, e a informação se perde |
| Operador / gestor | Lança o abastecimento no ERP VendPago por digitação manual | Reconstrói a visita por dedução; não sabe quanto foi reposto em cada mola nem quais tiveram troca de produto |

---

## Goals

| Priority | Goal |
|---|---|
| **MUST** | Permitir ao abastecedor registrar quantidades inseridas por mola em interface de toque, sem digitação livre |
| **MUST** | Registrar troca de produto em mola a partir de lista fixa de produtos |
| **MUST** | Gerar roteiro de digitação contendo apenas as molas alteradas, ordenado por posição |
| **MUST** | Ler o estoque do VendPago por automação de navegador em modo exclusivamente leitura |
| **MUST** | Exibir, por mola, o estoque registrado no VendPago e o volume ainda não digitado |
| **SHOULD** | Preservar o registro localmente quando a conexão cair durante a visita |
| **SHOULD** | Exibir a idade da última sincronização bem-sucedida |
| **COULD** | Marcar itens do roteiro como já lançados no VendPago |

---

## Success Criteria

- [ ] O abastecedor conclui o registro de uma visita completa em até 120 segundos
- [ ] O roteiro de digitação lista exclusivamente as molas alteradas, ordenadas por posição
- [ ] 100% das trocas de produto em mola aparecem identificadas como troca no roteiro
- [ ] Zero solicitações de esclarecimento do operador ao abastecedor após uma visita registrada
- [ ] A sincronização de leitura executa 3 vezes ao dia
- [ ] Zero operações de escrita executadas contra o VendPago
- [ ] A tela de estoque sempre exibe a data e hora da última sincronização bem-sucedida

---

## Acceptance Tests

| ID | Pattern | Criterion (EARS) | Gate (`kind`) |
|---|---|---|---|
| AT-001 | Event-driven | **When** o abastecedor fecha uma visita, the system **shall** gerar um roteiro contendo apenas as molas alteradas, ordenado por posição | test |
| AT-002 | Event-driven | **When** o abastecedor seleciona para uma mola um produto diferente do atual, the system **shall** registrar o evento como troca de produto e identificá-lo como tal no roteiro | test |
| AT-003 | State-driven | **While** existirem visitas fechadas não marcadas como digitadas, the system **shall** exibir por mola a quantidade lida do VendPago e a quantidade pendente de lançamento | test |
| AT-004 | Ubiquitous | The system **shall** interagir com o VendPago exclusivamente por operações de leitura, sem submeter formulários nem executar ações de alteração | test |
| AT-005 | Event-driven | **When** a sincronização agendada executar, the system **shall** registrar um novo snapshot de estoque 3 vezes ao dia | test |
| AT-006 | Ubiquitous | The system **shall** permitir concluir o registro de uma visita completa em até 120 segundos | manual-ux |
| AT-007 | Unwanted | **If** a sincronização com o VendPago falhar, **then** the system **shall** preservar o último snapshot válido e exibir a data e hora da última sincronização bem-sucedida | test |
| AT-008 | Unwanted | **If** o abastecedor não registrar alteração em uma mola, **then** the system **shall** tratá-la como não abastecida e omiti-la do roteiro | test |
| AT-009 | Unwanted | **If** a conexão cair durante o registro da visita, **then** the system **shall** preservar localmente os dados já informados e permitir o envio quando a conexão retornar | test |

---

## Clarifications

### Session 2026-09-08

- [x] (NFRs) Tempo máximo aceitável para registrar uma visita completa → Até 2 minutos (120 segundos); integrado em Success Criteria e AT-006
- [x] (Integrations) Frequência exata da sincronização automática com o VendPago → 3 vezes ao dia (manhã, tarde e noite); integrado em Success Criteria e AT-005
- [x] (Done signal) Stack e comando de teste do projeto → Node/TypeScript com Vitest, executado por `npm test`; integrado em Verify Gate e Technical Context
- [x] (Scope) O robô pode alterar dados no ERP? → Não; somente leitura, decisão tomada durante o Brainstorm que substitui a proposta inicial de escrita automatizada; integrado em Goals, AT-004 e Out of Scope

---

## Verify Gate

```yaml
verify_gate:
  kind: test
  cmd: "npm test"
  pass_when: "exit 0"
  threshold: "—"
  manual_fallback: "—"
```

---

## Out of Scope

- Qualquer operação de escrita, alteração ou submissão de formulário no ERP VendPago
- Cálculo próprio do saldo do compartimento lateral
- Coleta financeira e conciliação de valores
- Gestão de múltiplas máquinas ou rotas
- Cadastro de produtos novos em campo
- Recontagem ou inventário por contagem de estado final
- Histórico analítico, gráficos e alertas de ruptura
- Substituição do VendPago como sistema de registro oficial

---

## Constraints

| Type | Constraint | Impact |
|---|---|---|
| Technical | O ERP VendPago não possui API pública documentada | A escrita permanece manual; a leitura depende de automação de navegador sobre HTML de terceiro |
| Technical | Navegador headless exige VPS ou container | Inviabiliza hospedagem estática gratuita; adiciona agendador e fila |
| Technical | Registro ocorre na frente da máquina, com sinal potencialmente instável | Exige tolerância a queda de conexão durante a visita |
| Technical | Nomenclatura de molas e produtos deve espelhar a do VendPago | Evita tradução mental do operador, que reintroduziria o retrabalho |
| Resource | Credencial do VendPago armazenada no servidor dá acesso à conta inteira, incluindo coleta financeira | Exige armazenamento cifrado e superfície de risco documentada |
| Other | Termos de uso da VendPago podem proibir acesso automatizado | Risco de suspensão da conta que opera a máquina; verificação pendente antes do Build |
| Timeline | N/A | — |

---

## Technical Context

| Aspect | Value | Notes |
|---|---|---|
| **Deployment Location** | VPS ou container com runtime Node/TypeScript | Requisito do navegador headless; projeto greenfield, sem base de código existente |
| **KB Domains** | Base pública VendPago (telemetria, definições de estoque, importação CSV de produtos) | Fonte da nomenclatura de molas e produtos |
| **IaC Impact** | New resources | Servidor de aplicação, agendador de sincronização e armazenamento cifrado de credencial |
| **LLM Prompts** | false | Nenhum sinal de prompt em runtime, agente, RAG, classificador ou geração por modelo; o sistema é CRUD, automação de navegador e geração determinística de roteiro |

---

## Assumptions

| ID | Assumption | If Wrong, Impact | Validated? |
|---|---|---|---|
| A-001 | O login do VendPago não exige 2FA nem captcha | O robô de leitura torna-se inviável; o sistema degrada para registro de visita e roteiro sem visão de estoque | no |
| A-002 | Os termos de uso da VendPago permitem acesso automatizado de leitura | Risco contratual e possível suspensão da conta; robô sai do escopo | no |
| A-003 | A estrutura HTML das telas de estoque do VendPago é estável o suficiente para scraping | Manutenção recorrente do robô; aumenta custo operacional | no |
| A-004 | A operação envolve uma única máquina | Modelo de dados precisaria de entidade Máquina desde o v1 | yes |
| A-005 | O mapa das molas do usuário é suficiente para semear o planograma | Cadastro manual inicial mais demorado | no |
| A-006 | O operador que digita no VendPago é o próprio usuário | Exigiria controle de acesso multiusuário no v1 | no |

---

## Clarity Score Breakdown

| Element | Score (0-3) | Notes |
|---|---:|---|
| Problem | 3 | Dor específica, com usuário afetado e causa raiz identificada |
| Users | 3 | Dois usuários distintos, com papéis e pain points próprios |
| Goals | 3 | Priorizados em MUST/SHOULD/COULD, derivados de decisões validadas |
| Success | 3 | Todos os critérios com alvo numérico ou observável |
| Scope | 2 | Fronteiras explícitas, mas dependências externas não resolvidas (termos de uso, existência de API) podem alterar o escopo do robô |
| **Total** | **14/15** | |

Minimum to proceed: **12/15**.

---

## Open Questions

- Quantas molas a máquina possui? Afeta o dimensionamento da grade visual e a validação prática do alvo de 120 segundos, mas não altera comportamento especificado.
- O suporte da VendPago confirma existência de API, exportação agendada ou importação de inventário por CSV? Se sim, o robô de leitura pode ser substituído por integração de menor risco no Design.
- Amostras pendentes de anexo: mapa das molas e export do relatório de estoque do VendPago.

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-09-08 | SDD Define by RDD | Initial version |

---

## Next Step

Execute o **SDD Design by RDD**.
