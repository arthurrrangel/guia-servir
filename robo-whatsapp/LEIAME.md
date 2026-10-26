# Robô do WhatsApp da escala (Mídia)

Posta a escala da Mídia nos 8 grupos da Multimídia pelo número da igreja
(+55 21 97297-6946) e cobra no Multimídia · Geral, com @, quem ainda não
confirmou. Roda neste MacBook, sozinho, como serviço do macOS. Decisão do
Arthur em 26/10/2026: "tá tudo liberado, eu quero tudo automatizado".

## O que ele faz e quando

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

Conversa privada, grupo fora da tabela (Louvor, Connect, LÍDERES GUIA...),
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
| Envio INCERTO em um grupo | Olhe o grupo. Saiu: `node robo.mjs --conferido 2026-10-31 "Multimídia · Foto" saiu`. Não saiu: troque `saiu` por `nao-saiu` (sai na próxima rodada). Ou avise o Claude. |
| O grupo não é mais o mesmo do começo | Alguém renomeou ou recriou o grupo. Se foi de propósito: `node robo.mjs --grupos --refixar` (com o robô parado; o `configurar.command` para e religa). |
| Estado estragado | Avise o Claude. Nada sai enquanto isso, para não mandar em dobro. |
| Desligado do número da igreja | Rode o `configurar.command` e leia o QR com o celular da igreja. |
| Não achei o grupo | O nome do grupo mudou. O nome tem de ser exatamente o da tabela (`config.mjs`), com o ponto do meio "·". |
| Só admin escreve e a igreja não é | Torne o número da igreja admin do grupo, ou libere o grupo. |
| Mudou de novo depois de 4 versões | Mande a escala pelo sistema ("Mandar nos grupos"). |

## Comandos (no Terminal, dentro de `~/robo-whatsapp-guia`)

- `node robo.mjs --status`: conexão, grupos, último envio, avisos.
- `node robo.mjs --ensaio`: lê a escala dos próximos 7 dias e diz o que faria, sem mandar nada.
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

## Riscos que o Arthur aceitou

- Não é a API oficial da Meta: o WhatsApp pode bloquear o número da igreja.
  Por isso o robô manda pouco, devagar e só nos grupos.
- Só roda com o MacBook ligado e com a tampa aberta.
- A pasta `sessao/` é a chave do número da igreja. Não copie, não mande para
  ninguém, não ponha no Git.
