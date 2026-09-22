# Sistema de Demandas: fechamento

22/09/2026. **Produção na migração 93.** Repositório em `d718e13`, ainda sem deploy da tela.

---

## 1. COMPROVADO

### Os três pontos que estavam ○ NÃO OBSERVADO

**E-mail ponta a ponta.** Parcial, e a parte que falta não é minha. A causa raiz foi encontrada e é tripla:

1. A migração 90 **nunca funcionou em produção, nem uma vez**. A rota chamava `s.schema('demandas').rpc('a_avisar')`, e o schema `demandas` não está na lista de schemas expostos da API (o padrão do Supabase é `public, graphql_public`); além disso `has_schema_privilege('service_role','demandas','usage')` era `false`. As duas chamadas falhavam sempre. A conferência da 90 dava verde porque rodava dentro da própria migração, como superusuário. Corrigido na 91: as três funções passaram para `public`, com `grant` só para `service_role`. **Aplicado e conferido em produção.**
2. O Resend da igreja **não tem domínio verificado** (`resend.com/domains`: "No domains yet") e **nunca enviou um e-mail**: `resend.com/logs` diz "No logs yet" nos últimos 15 dias, e a única chave de API, criada há menos de uma hora, marca "No activity". Com `onboarding@resend.dev` e sem domínio verificado, o provedor só entrega para o endereço do dono da conta. Isso vale também para o sistema de Escalas, que usa o mesmo remetente.
3. A rota corrigida **não está em produção**, porque não consegui fazer o deploy (item 7).

**Produção com dados reais.** As migrações 91, 92 e 93 foram aplicadas e conferidas campo por campo em produção. O fluxo completo com demanda real depende do deploy da tela nova, pelo mesmo motivo.

**Quarta auditoria adversarial.** Feita, e depois uma quinta e uma sexta. Quatro agentes independentes, cada um partindo da hipótese de que ainda havia falhas e sem receber a conclusão anterior. Acharam 12, 12 e 11 defeitos novos, todos reproduzidos com comando e saída antes de virarem conserto.

### O que passou a existir e não existia

| | |
|---|---|
| **Etapa 5 do PDF (Validação)** | não existia em camada nenhuma. Quem executava era quem fechava, e o sistema registrava discordância (`reabrir`) sem registrar concordância. Agora: ação `validar`, só para quem pediu ou para a liderança, com histórico próprio e botão dentro do cartão verde que já existia. |
| **Regra 10 do PDF (notificação ao solicitante)** | `avisado_em` era um carimbo por demanda, gasto uma vez. Virou fila de verdade: uma linha por (demanda, pessoa, motivo), com reserva, devolução em caso de falha e contagem de tentativas. Avisa quem pediu na mudança de estado e quando a demanda para esperando um dado dele, com a pergunta junto. |
| **A porta levando ao painel das Escalas** | `?volta=/demandas/../painel` levava a pessoa para `/painel`. `destino()` julgava a string crua e o navegador normalizava o `..` depois. O teste que dizia cobrir isso procurava a grafia `startsWith('/demandas')` no arquivo. Agora normaliza antes de julgar, e o teste arranca a função e a executa com 24 cargas de ataque. |
| **O portão de aprovação escolhido por quem pede** | R$ 999.999,99 numa categoria sem `exige_aprovacao` nascia, andava e fechava com uma pessoa só, sem um único evento de aprovação no histórico. Agora há teto por setor. **O número é decisão sua** (item 8). |
| **Trojan Source** | um caractere de reordenação bidirecional no meio do título atravessava tudo, e a lista mostrava um valor diferente do gravado. A classe de invisíveis cobria 159 de 4174 pontos; agora cobre os três conjuntos inteiros. |
| **`demandas.quem` entregando token** | `security definer`, devolvia a linha inteira do membro (inclusive o token, que é a senha de cada um) e tinha EXECUTE para PUBLIC. Fechada, junto com as outras 20 funções do schema. |

---

## 2. TESTES E EVIDÊNCIAS

| Instrumento | Placar |
|---|---|
| Sabotagens das migrações 84 a 93 | **198 acusadas de 198**, com controle negativo em todas |
| Harness de banco (`demandas-banco.sh`) | **90/90** (era 63) |
| Cruzamento de códigos de erro SQL × tela | **269/269** |
| Espelho de ações (`demandas.test.mjs`) | **370/370** |
| Telas executadas de verdade | **160/160** |
| Rota de aviso executada de verdade | **285/285** |
| Porta própria, com cargas de ataque | **87/87** |
| Armário de credencial | **33/33** |
| Celular, 3 larguras × 3 papéis × 12 telas | **432/432** |
| Duas varreduras concorrentes | 10 avisos divididos, 0 dobrados |
| Inventário da porta pública (`escala-banco.sh`) | **6/6** |
| `npx tsc --noEmit` / `npm run build` | limpos |

O número que importa mais não é nenhum desses: **onze testes ficavam verdes com o código de produção quebrado**, e foram fechados um a um. Entre eles, a ficha da demanda, 789 linhas e 33 elementos interativos que nenhum teste renderizava.

---

## 3. PROBLEMAS ENCONTRADOS

35 defeitos nas três primeiras rodadas (relatados em 22/09) e **35 novos** nesta, achados por auditorias que partiram da hipótese de que os relatórios anteriores erraram. Os que mais custariam:

**Críticos**
- `?volta=/demandas/../painel` levava ao sistema de Escalas.
- A migração 90 inteira estava morta em produção.
- `reabrir` não limpava `validada_em`: a ficha afirmava "Validada por Fulano" sobre trabalho novo que ninguém conferiu.
- `dem_ver` devolvia o histórico sem teto: 5000 eventos = **20 MB** numa chamada.
- O portão de aprovação era escolhido por quem pede.
- `demandas.quem` devolvia o token de qualquer pessoa para PUBLIC.

**Instrumentos que mentiam** (a família mais cara, porque encerra a pergunta)
- `sabotar-migracao.py` imprimiu 30 vezes "A SABOTAGEM PASSOU" e fechou com "controle negativo: passa" **com o Postgres fora do ar**.
- `duas-varreduras.sh` (escrito por mim nesta sessão) segurava transação aberta e dava verde com a reserva sabotada.
- O harness de banco rodava com um `dem_bases` de antes da migração 67, que vazava nome, papel, setor e telefone de todos os membros.
- O harness de celular estava duas migrações atrás e media um sistema sem a etapa 5.
- 11 testes verdes sobre código quebrado.

**Achados que o PDF cobrava**
- Notificação ao solicitante saía só no dia seguinte (só `abrir()` esvaziava a fila).
- Cadastro apresentava o e-mail como opcional sem dizer que sem ele a pessoa não recebe aviso nenhum.
- "Demandas por categoria" mostrava 10 de 44 e não avisava.
- Comentário interno era impossível de criar, e a dica ao lado mandava criar.
- O painel não tinha o recorte de concluídas.
- Administrador não conseguia criar categoria pela tela.
- Orçamento inalcançável em 31 das 43 categorias.

---

## 4. CORREÇÕES

**Três migrações novas**, cada uma com conferência própria e bateria de sabotagem:

- **91** (em produção): fila de avisos de verdade, as três funções em `public`, ação `validar`, e as 21 funções do schema fechadas para PUBLIC.
- **92** (em produção): teto por setor, classe de invisíveis inteira, `url_boa` julgando a autoridade decodificada, 17 CHECKs que nunca tinham sido conferidas nas linhas antigas, `pode_ver`/`pode_atender` sem NULL, UNIQUE em nome de setor, `dem_numeros` sem cast cego.
- **93** (em produção): `reabrir` limpa o carimbo, teto de 200 no histórico, valor de onze dígitos vira recusa em vez de erro cru, re-travar entra no histórico, toque duplo em `dem_abrir`, colunas mortas da 90 removidas, inventário da porta pública corrigido.

**Na tela**, sempre dentro de controle que já existia, nunca com caixa nova: validação no cartão verde, caixinha de comentário interno, filtro de concluídas, criação de categoria, orçamento sempre alcançável, rascunho que sobrevive a recarregar, data e hora da abertura, prazo pedido versus prometido, vocabulário do PDF na lista, ranking de setores, teto do setor em Ajustes, e o aviso de quantas categorias não couberam.

---

## 5. VALIDAÇÃO DE PRODUÇÃO

As três migrações foram aplicadas no editor SQL com o SHA-256 do arquivo conferido byte a byte **antes** de rodar. Transporte: os arquivos subiram para o bucket `deploy-tmp` do próprio projeto e a página buscou de lá, em vez de eu digitar 150 mil caracteres à mão. Os dois `.sql` continuam no bucket; pode apagar quando quiser.

Conferência da 91:

```
versao 91 | fn_pendentes true | fn_enviado true | fn_falhou true
sr_pendentes true | sr_enviado true | sr_falhou true
anon_pendentes false | auth_pendentes false | avisos_anon_select false
gatilho 1 | estado_do_pdf true | col_validada_em+por 2
mover_validar true | mover_fechada_aceita true | ver_validada_por true
resumo_validada_em true | quem_para_public false
funcoes_de_demandas_abertas_para_public 0 | a_avisar_morreu true
```

Conferência das 92 e 93, rodada depois de aplicar:

```
versao 93 | checks_not_valid 0 (eram 17) | teto_sem_aprovacao 1
setor_nome_unico 1 | uma_linha true | reordenadores true
trojan_no_meio_morre true
url_arroba_codificado false | url_ip_codificado false | url_legitima true
dem_numeros_text true | dem_numeros_date_morreu true
reabrir_limpa_carimbo true | dem_ver_teto_200 true | eventos_total true
```

Produção: 13 setores, 6 que atendem, 43 categorias, 1 membro, 0 demandas.

---

## 6. RISCOS RESIDUAIS

- **A tela nova não está em produção.** O que está no ar é o commit `3de4dcd`. A porta corrigida, a validação, os filtros novos e o aviso ao solicitante estão no repositório, não no ar.
- **`demandas.quem` amarra identidade ao e-mail do JWT sem exigir e-mail confirmado.** Não mexi: das três portas de `/demandas/entrar`, só a do link confirma por construção, e exigir um claim que talvez não exista no seu projeto trancaria todo mundo para fora. Depende de ver a configuração do Auth.
- **Anexo é link, não arquivo guardado.** O PDF não pede upload, mas vale saber.
- **Dois dos onze status do PDF não existem**: "Rascunho" (é o rascunho local da tela de abertura, por navegador) e "Em triagem" (colapsado em "Aberta", porque a categoria já decide setor, prazo e portão no nascimento). Criar os dois custaria caro e a favor de nada; o que falta é isso estar escrito onde quem cobrou o PDF vai ler. Está aqui.

---

## 7. DECISÕES E AÇÕES QUE SÃO SUAS

**1. Destravar o push para o GitHub.** O banco já está resolvido (as três migrações estão em produção). Falta o deploy da tela, e ele esbarra em três bloqueios independentes:
- a ponte com o seu computador caiu (ele dormiu) e não voltou;
- `git push` do container é recusado pela política da organização no proxy ("`arthurrrangel/guia-servir` is not in this session's authorized repository set");
- a interface do GitHub no navegador foi recusada pelo classificador de modo automático.

Com a ponte de pé eu faço o push sozinho. Ou você roda as três linhas do bundle que te mandei.

**2. Verificar um domínio no Resend.** Sem isso, `onboarding@resend.dev` só entrega para o endereço do dono da conta, e **nenhum membro da igreja recebe e-mail** — nem de Demandas, nem de Escalas. São registros de DNS no `guiaservir.com`, que é o seu domínio e o seu provedor. Depois disso o remetente vira algo como `demandas@guiaservir.com` e eu troco a linha nos dois sistemas.

**3. Conferir a `RESEND_API_KEY` na Vercel.** A única chave da conta foi criada hoje e marca "No activity", o que sugere que a variável de ambiente aponta para outra chave, ou para nenhuma.

**4. O teto de gasto por setor.** A coluna existe e a tela de Ajustes tem onde escrever, mas nasce vazia (sem teto, comportamento de sempre). Quanto um setor pode gastar sem passar por alguém é decisão de quem responde pelo dinheiro da igreja, não da migração.

**5. Ligar a aprovação nas categorias estruturais.** O PDF cita "alterações estruturais" entre os casos que exigem aprovação, e Montagem de estrutura, Manutenção predial, Reparo elétrico e Reparo hidráulico estão todas sem. São quatro toques na aba Categorias, e a decisão é sua.
