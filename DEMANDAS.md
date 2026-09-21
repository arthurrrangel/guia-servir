# Sistema de Demandas — GUIA Church

O que ele é, como está construído, e o que decidir sobre ele.
Atualizado em 21/09/2026.

---

## O que ele resolve

Uma demanda é um pedido operacional da igreja: comprar um projetor, consertar
o ar da sala do Kids, contratar o buffet do Follow. Antes existiam no WhatsApp
dos coordenadores, e o que se perdia era sempre a mesma coisa: quem pediu,
quem ficou de resolver, até quando, e se foi feito.

O sistema dá a cada pedido um número, um setor, um prazo e um responsável.
E, acima de tudo, um **portão de aprovação**: o que custa dinheiro não fecha
sem alguém aprovar.

---

## A regra que governa tudo: ele é separado das escalas

O sistema de escalas e o de demandas são dois produtos. Desde 21/09 a
separação é literal na interface: nenhum link, nenhuma menção, nenhum "voltar
para as escalas". Eram seis pontos de vazamento, todos em
`components/demandas/Casca.tsx`, e todos foram cortados.

O que já era separado antes, e continua:

- **Zero import de código.** Nenhum arquivo em `app/demandas/`,
  `components/demandas/` ou `lib/demandas/` importa nada do sistema de
  escalas. Conferido por varredura, não por leitura.
- **Zero link de volta.** As escalas nunca souberam que o Demandas existe.
- **Os dados moram atrás de uma parede.** As tabelas estão no esquema
  `demandas`, que não é exposto na API do Supabase. A única porta são as nove
  funções `dem_*`, todas `security definer`, que conferem quem está
  chamando. Nenhuma linha do Demandas alcança uma tabela de escala, e o
  contrário também não.

**O que ainda é compartilhado, dito sem maquiagem:** o projeto do Supabase e a
sessão de login. Não por descuido — duas portas de login na mesma origem
criam dois clientes de sessão disputando a mesma chave no navegador, e é assim
que se derruba o login do líder. O motivo está escrito em `lib/demandas/api.ts`.

Separar isso de verdade exige uma destas duas coisas, e as duas têm custo:

1. **Origem própria** — `demandas.guiaservir.com`. Os dois clientes deixam de
   brigar porque não dividem mais o mesmo `localStorage`.
2. **Só link pessoal** — tirar o caminho do e-mail e identificar todo mundo
   por token. Barato de fazer, mas quem organiza perde a conveniência de já
   chegar identificado.

Essa decisão é sua, não minha. Enquanto ela não vier, a porta de login é uma
só — mas desde 21/09 ela devolve a pessoa para o sistema de onde ela veio, em
vez de despejá-la no painel das escalas.

---

## As telas

| Caminho | O que é |
|---|---|
| `/demandas` | O painel. Uma lista, não um quadro de colunas. |
| `/demandas/nova` | Abrir uma demanda. |
| `/demandas/d/[numero]` | Uma demanda: histórico, ações, anexos. |
| `/demandas/numeros` | Indicadores. Some para quem é só solicitante. |
| `/demandas/ajustes` | Setores, categorias, pessoas. Só admin. |

O painel é uma lista de propósito. Quadro com onze colunas é bonito na
apresentação e, no celular, vira rolagem horizontal onde ninguém acha nada.
Cada linha diz, numa olhada: número, título, quem pediu, quem atende, o estado
e o tempo. O que precisa de atenção sobe.

As abas do topo são as quatro perguntas que as pessoas fazem de verdade: *o
que eu pedi*, *o que caiu no meu setor*, *o que é meu*, *tudo*. Elas mudam
conforme o papel — perguntar "o que caiu no meu setor" para quem não atende
nada seria uma aba sempre vazia.

---

## Os estados de uma demanda

```
aberta → execucao → concluida
   ↓         ↓
travada   cancelada
```

`travada` carrega **por quê**, e o banco obriga: `informacao`, `aprovacao` ou
`terceiros`. Trava sem motivo é constraint violada, não linha gravada.

Três regras que o banco impõe, não a tela:

- **Concluída exige conclusão escrita.** `ck_conclusao`.
- **Cancelada exige motivo.** `ck_cancelada`.
- **Sem prazo exige explicar por quê.** `ck_prazo`. "Não sei quando" é uma
  resposta aceitável; silêncio não é.

E a prioridade é fechada em quatro: `baixa`, `normal`, `alta`, `urgente`.

---

## O portão de aprovação

É o assunto mais sério do sistema, e o que mais deu trabalho.

Categoria com `exige_aprovacao` faz a demanda nascer `travada / aprovacao /
pendente`. Ela só anda quando alguém com poder aprova — e a aprovação fica
registrada com quem, quando e com que nota.

A migração 67 fechou **três portas dos fundos** que existiam:

1. **`concluir` não olhava a aprovação.** Dava para marcar como concluída uma
   demanda que exige aprovação e ninguém aprovou. O gasto fechava.
2. **`cancelar` + `reabrir` lavava a trava.** A demanda voltava como
   `execucao / pendente`, fora do portão.
3. **`destravar` lia o rótulo da trava, não a aprovação.** Bastava o rótulo
   estar diferente para a demanda escapar.

Desde a 67, as quatro guardas leem a **mesma** condição: `aprovacao =
'pendente'`. Não é elegância — é que quatro condições parecidas escritas em
quatro lugares foi exatamente como as três portas nasceram.

---

## Como o sistema sabe quem é você

`dem_quem_sou` tenta, nesta ordem:

1. O **token** do link pessoal, se houver um guardado.
2. O **e-mail do JWT**, se a pessoa estiver logada.

Se o token guardado for velho e a resposta for negativa, o token é descartado
e a pergunta é refeita — senão um link antigo no navegador sombreava o login
para sempre, e a pessoa via "este link não vale mais" sem saída nenhuma.

Três papéis: `solicitante`, quem atende um setor, e `admin`.

---

## A parte do banco

**Esquema `demandas`**, fora da API:

| Tabela | Colunas | RLS |
|---|---|---|
| `demandas` | 34 | sim |
| `membros` | 11 | sim |
| `categorias` | 9 | sim |
| `eventos` | 9 | sim |
| `setores` | 6 | sim |
| `anexos` | 6 | sim |

**As nove portas**, todas `security definer`, todas conferindo quem chama:

`dem_quem_sou`, `dem_bases`, `dem_lista`, `dem_ver`, `dem_abrir`, `dem_mover`,
`dem_ajustar`, `dem_numeros`, `dem_pessoas`.

`dem_lista` tem teto de 300 linhas (migração 57) e devolve `tem_mais` — sem
isso, a tela do celular puxava a tabela inteira para mostrar vinte linhas.

---

## O que foi construído em cima disso, por migração

| # | O que resolveu |
|---|---|
| 50 | O sistema inteiro: esquema, tabelas, as nove funções, RLS. |
| 52 | `dem_mover` e `dem_abrir` endurecidas; GRANT de `voluntarios` relido do catálogo. |
| 57 | Teto de 300 em `dem_lista`, com `tem_mais`. |
| 67 | As três portas dos fundos do portão de aprovação. |
| 68 | `dem_lista` parou de devolver o erro cru do Postgres na cara do usuário. |
| 80 | Os casts que a 68 deixou passar (`nullif(...,'')` antes do `::boolean`). |

E a suíte `scripts/demandas-banco.sh` roda **62 casos** contra o banco,
conferindo que as regras do PDF original valem de verdade — incluindo as
quatro guardas do portão.

---

## O que está no ar agora, e o que não está

**Atenção, e é o que mais importa neste documento:** o que você vê hoje em
`escalas.guiaservir.com/demandas` é a **tela nova rodando sobre o banco na
versão 57**.

Isso significa que as três portas dos fundos do portão de aprovação **ainda
estão abertas em produção**. Dá para concluir uma demanda que exige aprovação
sem ninguém aprovar. A correção está escrita, testada e no GitHub desde hoje,
mas a lógica mora no banco, e o banco só recebe quando as migrações forem
aplicadas.

Enquanto elas não entram, julgue o sistema pela versão errada.

---

## O que ficou de decisão sua

1. **Separação de login.** Origem própria (`demandas.guiaservir.com`) ou só
   link pessoal. Hoje a porta é uma só, mas já devolve para o lugar certo.
2. **Terminar a transição de identidade.** Nove dos onze organizadores estão
   só na tabela antiga (`lideres`), sem `pessoas`/`papeis`. Ninguém perdeu
   acesso — as funções de autorização aceitam os dois caminhos — mas quem
   vira admin e quem vira líder no modelo novo é decisão de quem administra
   a igreja, não de uma migração.
