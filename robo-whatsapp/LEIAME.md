# Robô do WhatsApp da escala

Posta a escala nos grupos do WhatsApp pelo número da igreja
(+55 21 97297-6946). Roda sozinho, como serviço: primeiro no MacBook do Arthur
(macOS, launchd) e, desde 29/10/2026, num servidor sempre ligado (Linux,
systemd). Veja "No servidor", abaixo.
Decisões do Arthur em 26/10/2026: "tá tudo liberado, eu quero tudo
automatizado"; depois, "Gostaria de na aba do sistema ter a opção de
disparar escala, através desse robo" e "Para todos os ministérios".

- **Mídia**: sai sozinha nos 8 grupos da Multimídia (horários abaixo) e cobra
  no Multimídia · Geral, com @, quem ainda não confirmou. Também a pedido.
- **Louvor e Connect**: só a pedido, pelo botão do sistema (o Arthur desligou
  o envio automático do Louvor em 16/10).
- **GUIA Kids e Livraria**: sem grupo na tabela; o botão diz isso.

## O botão "Mandar agora pelo robô"

No sistema, na Escala, cada dia tem "Mandar nos grupos". Com o robô ligado,
aparece em cima "Pelo robô": a liderança do ministério aperta, confirma, e o
robô manda a escala daquele dia em todos os grupos do ministério (as mesmas
mensagens das linhas de baixo), uma a cada 15 a 40 segundos. A tela mostra o
andamento e o que aconteceu em cada grupo. Grupo que já tem a escala não
recebe de novo. Sem cobrança: a cobrança com @ é só da Mídia, no horário.

O robô passa no sistema a cada 30 segundos. Se ele não passar por 3 minutos
(Mac desligado, dormindo, sem internet), a tela diz "Robô desligado agora" e
o botão some: aí vale mandar à mão, pelas linhas de baixo. Um pedido que o
robô não pegou em 30 minutos vence sem mandar nada.

## O que ele faz sozinho (só a Mídia) e quando

- **Quinta 19:58**: a escala do Follow de sábado, no geral e em cada grupo.
- **Sexta 19:58**: a escala de domingo, do mesmo jeito.
- **Todo dia 12:00 e 19:58**: cobra no Multimídia · Geral quem falta confirmar
  (só depois de a escala estar no grupo há 6 horas, no máximo duas vezes por
  dia, nunca depois de o culto começar). Dois cultos pendentes viram uma
  mensagem só.
- **Todo dia 09:00, 12:00 e 19:58**: se alguém foi trocado depois do envio, a
  versão nova vai só no grupo que mudou (e no geral). Confirmar não conta como
  mudança. No máximo 4 versões da mesma escala no mesmo grupo.
- **Mac dormindo na hora**: a rodada ainda roda até 1h30 depois; passou disso,
  o que ficou para trás sai na rodada seguinte.

O texto é sempre o do "Mandar nos grupos" e do "Cobrar confirmação" do
sistema (guiaservir.com): o robô não escreve nada por conta própria.

Cada envio fica gravado antes de sair. Se o Mac desligar no meio de um
envio, aquele grupo fica "incerto" e o robô não manda de novo sozinho.

## O que ele nunca faz

Conversa privada, grupo fora da tabela (LÍDERES GUIA, qualquer outro),
apagar mensagem, entrar ou sair de grupo, mexer em configuração. Ligado a
qualquer número que não seja o da igreja, não manda nada. Uma escala cuja
hora de sair veio antes de o robô começar fica com quem já mandava. Cada
grupo fica preso ao endereço que tinha no primeiro encontro: outro grupo
renomeado com o mesmo nome nunca recebe a escala.

## Pausar e retomar

- **Pausar na hora**: dois cliques em `pausar.command` (nesta pasta).
- **Voltar**: dois cliques em `retomar.command`.

Se o WhatsApp recusar uma mensagem, o robô se pausa sozinho e avisa. Nada
mais sai até alguém conferir o número da igreja e rodar o `retomar.command`.

## Os avisos (notificação no Mac)

| Aviso | O que fazer |
|---|---|
| Envio INCERTO em um grupo | Olhe o grupo. Saiu: `node robo.mjs --conferido 2026-10-31 "Multimídia · Foto" saiu`. Não saiu: troque `saiu` por `nao-saiu` (sai na próxima rodada, ou no próximo aperto do botão). Vale para qualquer ministério, pelo nome do grupo. Ou avise o Claude. |
| O grupo não é mais o mesmo do começo | Alguém renomeou ou recriou o grupo. Se foi de propósito: `node robo.mjs --grupos --refixar` (com o robô parado; o `configurar.command` para e religa). |
| Estado estragado | Avise o Claude. Nada sai enquanto isso, para não mandar em dobro. |
| Desligado do número da igreja | Rode o `configurar.command` e leia o QR com o celular da igreja. |
| Não achei o grupo | O nome do grupo mudou. O nome tem de ser exatamente o da tabela (`config.mjs`), com o ponto do meio "·". |
| Só admin escreve e a igreja não é | Torne o número da igreja admin do grupo, ou libere o grupo. |
| Mudou de novo depois de 4 versões | Mande a escala pelo sistema ("Mandar nos grupos"). |

## Comandos (no Terminal, dentro de `~/robo-whatsapp-guia`)

- `node robo.mjs --status`: conexão, grupos, último envio, avisos.
- `node robo.mjs --ensaio [louvor|servico] [AAAA-MM-DD]`: lê a escala (dos próximos 7 dias, ou do dia) e diz o que faria, sem mandar nada. Sem ministério, a Mídia.
- `node robo.mjs --mandar-agora AAAA-MM-DD [louvor|servico]`: o mesmo que o botão, pelo Terminal. Na Mídia, depois disso o robô repõe as trocas dela todo dia; a cobrança com @ continua só nos 2 dias antes do culto.
- `node robo.mjs --a-partir-de AAAA-MM-DDTHH:MM-03:00`: de quando o robô cuida das escalas.
- `./configurar.command`: reinstala, confere o segredo, pareia de novo se precisar e religa o serviço.

O registro fica em `logs/robo.log`, sem nome nem telefone de ninguém.

## Desligar de vez

```
launchctl bootout gui/$(id -u)/com.guiachurch.robo-whatsapp
rm ~/Library/LaunchAgents/com.guiachurch.robo-whatsapp.plist
```

Depois, no celular da igreja, remova o aparelho "Mac OS" em Dispositivos
conectados.

## No servidor (desde 29/10/2026)

No Mac, o robô parava toda vez que a tampa fechava: o macOS dorme e leva o
robô junto. Medido em 28/10: o Mac dormiu das 18:10 às 21:57 e a rodada das
19:58 não saiu; as das 09:00 e 12:00 saíram mais de uma hora atrasadas. O
Arthur escolheu um servidor que nunca dorme (Ubuntu 24.04, 1 GB).

- **Levar**: `levar-para-o-servidor.command <IP>`, no Mac, depois de o
  servidor existir e aceitar a chave SSH do Mac. Ele prepara o servidor
  (`servidor/configurar-servidor.sh preparar`: Node 22, usuário `robo`,
  firewall só com SSH, atualizações de segurança automáticas), para o robô do
  Mac, copia por SSH o estado (o que já saiu em cada grupo), a sessão do
  WhatsApp, o segredo e o código novo, e liga o robô lá (`ligar`: bibliotecas,
  testes, conferência dos grupos e o serviço). Se o servidor não ligar, o
  robô volta a rodar no Mac como antes.
- **Depois**: o Mac fica com o arquivo `NO-SERVIDOR` (o endereço do servidor)
  e não liga mais o robô, nem depois de reiniciar: dois robôs com a mesma
  sessão derrubam um ao outro. O `pausar.command`, o `retomar.command` e o
  `ver-o-robo.command` do Mac agem no servidor, pela chave SSH.
- **No servidor** (`ssh robo@<IP>`, pasta `~/robo-whatsapp-guia`): os mesmos
  comandos de sempre (`node robo.mjs --status`, `--ensaio`...). O serviço:
  `sudo systemctl status robo-whatsapp-guia`; o registro: `logs/robo.log`.
- **Se o WhatsApp não aceitar a sessão no servidor**: pareie de novo lá
  (`node robo.mjs --parear --codigo`, com o serviço parado, e o código no
  celular da igreja).

## Riscos que o Arthur aceitou

- Não é a API oficial da Meta: o WhatsApp pode bloquear o número da igreja.
  Por isso o robô manda pouco, devagar e só nos grupos.
- No Mac, só roda com o MacBook ligado e com a tampa aberta (por isso o
  servidor, desde 29/10/2026).
- A pasta `sessao/` é a chave do número da igreja. Não copie, não mande para
  ninguém, não ponha no Git.
