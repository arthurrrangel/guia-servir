# Sistema de Demandas · entrega de 22/09/2026

Estado: **produção na migração 89**. A 90 está escrita, testada e no GitHub, e
**não aplicada** — falta um clique seu, e explico no fim por quê.

---

## 1 · FALHAS ENCONTRADAS

Três auditorias adversariais, cada uma partindo do princípio de que a anterior
deixou falha para trás. A terceira encontrou as piores, e a maioria delas era
minha: arquivos que **afirmavam** ter consertado uma classe de defeito e
tinham consertado só o caso medido.

### No banco

| # | O que era | Como se provou |
|---|---|---|
| 1 | `url_boa()` devolvia **NULO** com host vazio. `if not NULL` em plpgsql cai no ramo falso, então `https://:8443/boleto.pdf` passava pela guarda da RPC **e** pela CHECK da tabela, e o rótulo saía sem host | `select demandas.url_boa('https://:8443/x.pdf')` → nulo; `dem_mover('anexar')` → `{"ok": true}`; `insert` direto → `INSERT 0 1` |
| 2 | `limpo()` conhecia **20 dos 170** pontos Cf do Unicode. Passavam U+202A-202E (Trojan Source, que **reordena** o texto na tela) e U+E0020-E007F (texto escondido) | `dem_abrir` com título de 5 caracteres invisíveis → `{"ok": true, "numero": 46}`, linha em branco na lista |
| 3 | A lista de invisíveis era **duas cópias** e só uma cresceu. O comentário da 88 dizia "a MESMA classe de espaço de `limpo()`" e faltavam 13 pontos. U+3164 é citado nominalmente na 88 como aprendido, e passava no host | classe de `limpo()` 32 entradas, de `url_boa` 12; `https://drive.google<U+00AD>.com/...` aceito |
| 4 | `falta_aprovacao` devolvia **NULO** em toda demanda fechada (`NULL or false` = NULL), e `tipos.ts` declara `boolean` | `jsonb_typeof(...)` → null em 112 de 117 linhas |
| 5 | A regra de IP da 88 recusava **host legítimo**: `1.bp.blogspot.com`, `0.gravatar.com`, `123.imagem.com.br` | `url_boa` → false nos três |
| 6 | `dem_abrir` tinha **dois casts uuid cegos** (`setor_solicitante`, `setor_responsavel`), e a 88 afirma que a 86 os fechou. Disparava para qualquer membro, antes da linha que descarta o valor | fuzz de 17 campos × 12 valores → 22 exceções `22P02` cruas, todas nesses dois |
| 7 | A guarda nova da 88 em `dem_ajustar` admitia `''` e o cast recusava. Mais FK e not-null subindo crus | `{"ordem":""}` → `22P02 integer`; `{"nome":null}` → `23502`; setor_id inexistente → `23503` |
| 8 | `dem_ajustar` criava **categoria sem nome** | `{"grupo":"X","nome":"   "}` → `{"ok": true}` |
| 9 | `dem_numeros`: `to_char(criada_em,'YYYY-MM')` no fuso da **sessão**. Na virada do mês `por_mes` contradizia `total`. A sonda da 88 não via porque era uma lista de padrões conhecidos | 30/09 21:30 no Rio → `total 118`, `por_mes` com um balde em `2026-10` |
| 10 | `limite` 0 e -1 aceitos e trocados por 1 **em silêncio**, três linhas abaixo de a 88 escrever que isso não se faz | `{"limite":"0"}` → limite 1, 1 item |
| 11 | Apertar `limpo()` **congelava linha viva**: a CHECK `not valid` vale em todo UPDATE, e `dem_mover` sempre escreve `mexida_em` — até comentar parava, com o texto cru do Postgres na tela | `assumir` e `comentar` → `{"erro":"REGRA","regra":"violates check constraint"}` |
| 12 | A CHECK do anexo **prendia** o anexo ruim: `desanexar` faz UPDATE, o UPDATE reprova, e não havia saída | encadeado a partir do item 1 |
| 13 | Marca de idempotência da 88 ancorada em **comentário**, na seção que condena isso | sobre corpo sem comentários a troca reaplica |

### Na tela, que estava com metade do conserto

| # | O que era |
|---|---|
| 14 | A pílula lia a **coluna** enquanto `acoesDe` já lia o **veredito**: a grade tirava "Concluir" e "Assumir" e a pílula dizia "Aberta". A demanda congelava e a tela não tinha uma palavra sobre o porquê |
| 15 | "Por que atrasou" rotulado **"Opcional"**, e o banco recusa sem ele. Toda conclusão atrasada era recusada uma vez |
| 16 | "Mudar o prazo": tirar a data exige motivo e **não havia campo**. Numa demanda sem prazo bastava abrir e tocar em Gravar |
| 17 | O contador de letras prometia **4000 em quatro das sete caixas**, onde a CHECK é 2000 |
| 18 | Botão "tirar" oferecido em **anexo alheio**; o payload nem traz o `membro_id` |
| 19 | Seletor de travar oferecia "Esperando aprovação" numa demanda já aprovada, que o servidor recusa |
| 20 | O cartão "O que dá para fazer" renderizava **vazio**, sem uma palavra |
| 21 | O painel contava a coluna: o gestor via **zero** esperando aprovação |
| 22 | `min={HOJE()}` no seletor nativo do celular **não desce** abaixo do mínimo: a 88 devolveu o registro retroativo e a tela continuava impedindo |
| 23 | `exige_orcamento` sem controle nenhum em Ajustes, e três camadas dependiam dele |
| 24 | Dois `toISOString()` sobreviveram (`/numeros` e o detalhe): das 21h do Rio a tela pedia período que termina amanhã |
| 25 | 42501 virava `REDE` e caía na frase das ESCALAS ("ministério") — que é o que `SEM_PERMISSAO_DB` existia para bloquear. A chave era **morta** |
| 26 | Três chaves mortas em `PORBANCO`; dez CHECKs caindo num coringa sem nome de campo nem número |
| 27 | `/demandas/numeros` sem guarda de papel |

### E os instrumentos, que mentiam em cinco lugares

| # | O que era |
|---|---|
| 28 | O espelho do teste modelava `desanexar` como `anexar`: **concordava com o bug**. E a matriz nunca punha dono — apagar a guarda `JA_TEM_DONO` **não reprovava** os 784 casos |
| 29 | O extrator da sabotagem pegava o primeiro `do $conf$` e calava sobre o resto. As 27 sabotagens da 89 "passaram" medindo o bloco errado |
| 30 | `demandas-vazamento.mjs` pedia `/demandas/d/4`, que não existe desde que a semente começa no 40: media a tela de "não existe" |
| 31 | O harness do celular parava na 87 — media um banco **duas migrações atrás** |
| 32 | A conferência da 87 reprovava **das 21h à meia-noite do Rio, todo dia**, pelo mesmo defeito de fuso que a 88 consertou na função e não no teste |
| 33 | `cobranca-de-quinta.test.mjs` contava `crons.length === 1` e reprovava por motivo alheio ao que afirma |

### E o que você repetiu o dia todo

| # | O que era |
|---|---|
| 34 | O botão "Entrar" do Demandas levava para `/entrar`, que é **a tela das Escalas** ("ESPAÇO DO ORGANIZADOR"). Eu tinha consertado o **destino** do login (`?volta=`) e não a **porta** — "consertei o redirecionamento" não é "consertei o que você viu" |
| 35 | O setor **não ficava sabendo** que chegou demanda. Ela nascia, entrava na lista, e esperava ser encontrada |

---

## 2 · CORREÇÕES EXECUTADAS

**Migração 88** (já estava em produção): o cursor que vazava setor, três
instrumentos das Escalas que eu tinha deixado vermelhos, CHECKs que passavam
com nulo, fuso em dois pontos, quinze invisíveis, host com ponto final, a cura
que era teatro, `PRAZO_NO_PASSADO` revertido, `anon=X` nas funções de cirurgia.

**Migração 89** — a lista de invisíveis passou a ser **uma só**
(`demandas.invisiveis()`, os 170 pontos Cf conferidos contra a tabela do
Unicode, lidos por `limpo()` **e** `url_boa()`); `url_boa` nunca mais nula; IP
decidido pelo **último rótulo**; reparo do acervo **antes** de apertar a regra,
com o texto original preservado em evento; CHECKs validadas; `falta_aprovacao`
booleano em todo estado; guarda nos dois setores de `dem_abrir`; `nullif` nos
casts de `dem_ajustar` mais FK e not-null capturados; `limpo()` em nome de
cadastro; `to_char` no fuso do Rio com sonda que procura **qualquer** instante
fora de `demandas.dia()`; `limite` inválido avisa; a CHECK do anexo com
caminho de saída; `posso_tirar` por anexo, decidido pela **mesma expressão**
do `desanexar`.

**Migração 90** — `avisado_em` + `demandas.a_avisar()` + `marcar_avisado()`,
revogadas da porta pública. Quem atende o setor recebe; solicitante e quem
abriu não. O aviso carrega o portão. Setor sem e-mail não trava a fila.

**A rota do e-mail** — `/api/demandas/avisar`, com dois caminhos: a tela chama
na hora (sem `await`, com `catch` vazio, porque a demanda já está no banco) e
o cron varre o que ficou. Falha de e-mail **não carimba**.

**A porta própria** — `/demandas/entrar`. Não tem a rota do painel no código,
só aceita `?volta=` que comece com `/demandas`, os links de e-mail voltam para
ela, e não fala em escala, ministério, voluntário, equipe nem organizador.

**A tela** — as 14 correções da tabela acima, incluindo o `TETO` por ação
tirado do catálogo, a gaveta que abre sozinha quando o orçamento é
obrigatório, e a coluna de orçamento em Ajustes.

**Os instrumentos** — o espelho do teste passou de 784 para **2352 casos**
(com três donos); o extrator da sabotagem **recusa** arquivo com dois
`$conf$`; a rota do vazamento vem da semente; o harness do celular aplica até
a 90; a conferência da 87 não depende mais da hora do dia.

---

## 3 · TESTES E EVIDÊNCIAS

```
SABOTAGENS   84: 7/7   85: 12/12   86: 13/13   87: 8/8
             88: 16/16   89: 27/27   90: 12/12
             (e o controle negativo passa em todas)

CONFERÊNCIAS 89: 11 blocos    90: 9 blocos

npm test ............... 0     (com porta-propria 59/59 dentro)
build .................. 0
tsc .................... limpo
demandas-banco ......... 63/63
escala-banco ........... reaplicar é seguro onde deve ser
medida-celular ......... 14/14
contraste-real ......... 14/14
celular ................ 384/384
vazamento .............. 11/11
enxugar-conferir ....... 1581 linhas de catálogo, byte a byte
```

Cada correção foi **sabotada de volta** e a conferência **tem** que reprovar,
nomeando o caso. Duas sabotagens da 90 passaram na primeira rodada, e o
motivo era a minha fixture: a única solicitante com e-mail era quem abria as
demandas do teste, e não havia membro inativo. Duas linhas de fixture, e a
conferência passou a medir o que dizia medir.

---

## 4 · ESTADO REAL DA PRODUÇÃO

```
✓ COMPROVADO   schema_versao = 89  (marca M89-APLICADA, 22/09 01:0x)
✓ COMPROVADO   sonda de ataque, 8 blocos, dentro de transação com rollback:
               fora_do_portao 0 · curadas 0 · fechadas_sem_texto 0
               anexos_fora_da_regra 0 · eventos_gigantes 0 · VALIDADO
✓ COMPROVADO   o banco está VAZIO: 0 demandas, 0 anexos
✓ COMPROVADO   /demandas em guiaservir.com responde 200 e identifica quem
               tem sessão: "Demandas · Arthur · Secretaria"
✓ COMPROVADO   GitHub master = 3248535, com 88, 89, 90 e a porta própria

○ NÃO APLICADA migração 90. O arquivo está pronto, testado e no GitHub.
               Os dois Chromes que este chat alcança agora estão DESLOGADOS
               no Supabase, e eu não entro com a sua credencial.

≈ INFERIDO     o deploy da Vercel do commit 3248535 (porta própria + rota do
               e-mail) sai automático do master. Não vi o build terminar.
```

---

## 5 · RISCOS RESIDUAIS

**O aviso por e-mail sai de `onboarding@resend.dev`.** É o remetente de teste
do Resend: cai em spam com frequência e não pode ser usado de verdade. Precisa
de um domínio verificado (`demandas@guiaservir.com`). O sistema de escalas tem
o mesmo problema, e hoje.

**Não há lista de domínios permitidos para anexo.** A 85 deixou isso
registrado como sua decisão. Hoje qualquer `https://` com host de verdade
passa. Um link malicioso de um domínio legítimo entra.

**Login separado.** A porta é própria, mas a **conta** é a mesma do GUIA
Servir (mesmo Postgres, mesmo e-mail). Separar de verdade significa duas
contas por pessoa, e isso é decisão de produto, não técnica.

**Nove dos onze organizadores só existem em `lideres`.** A transição de
identidade não terminou. Quem não estiver em `demandas.membros` com
`auth_email` vê "você não está no sistema de demandas".

**Dois domínios, duas sessões.** `guiaservir.com` e
`escala-midia-iota.vercel.app` servem o mesmo app, mas o login do Supabase é
por origem. Entrar num não entra no outro. Não é defeito, é como funciona, e
vai confundir gente.

**As três funções de cirurgia** (`troca_unica`, `troca_unica_ou_ja`,
`troca_se_faltar`) ficam no banco entre migrações, revogadas da porta pública.
Poderiam ser derrubadas no fim de cada arquivo; não são, porque a próxima
migração precisa delas.

---

## 6 · DECISÕES QUE REALMENTE EXIGEM VOCÊ

**1. Domínio de e-mail para o aviso.** Sem isso o aviso existe mas cai em
spam. Verificar `guiaservir.com` no Resend é uma configuração de DNS que só
você pode fazer, e depois eu troco o remetente numa linha.

**2. Aplicar a 90.** Duas saídas: você abre o editor do Supabase e cola
`supabase/enxuto/90-o-setor-nao-ficava-sabendo-que-chegou-demanda.sql`, ou
libera no chat o Chrome que está logado no Supabase e eu faço.

**3. "Membro atuando em algum ministério" para poder pedir.** Isso **reacopla**
os dois sistemas: "ministério" é vocabulário das escalas, e `dem_abrir`
passaria a depender da tabela delas. A saída sem acoplar é o Demandas ter o
cadastro dele, com setor próprio, e quem administra marcar quem pode pedir —
mesma regra, sem um sistema lendo o outro. Preciso do seu aval.

**4. Lista de domínios permitidos para anexo.** Sua decisão desde a 85.

**5. CPF: você já decidiu tirar.** Nada foi gravado, e não vou gravar.

---

## Onde as coisas estão

| O quê | Onde |
|---|---|
| Entrar no sistema | `guiaservir.com/demandas` |
| Cadastrar quem pede e quem atende | `/demandas/ajustes` → nome, WhatsApp, setor, papel, e-mail, e o **link pessoal** para mandar no privado |
| Ligar aprovação e orçamento por categoria | `/demandas/ajustes`, tabela de categorias |
| Indicadores | `/demandas/numeros` |
| A porta de login do Demandas | `/demandas/entrar` |

O link pessoal é uma **senha**: quem tem o link entra como aquela pessoa.
Manda no privado, nunca em grupo.
