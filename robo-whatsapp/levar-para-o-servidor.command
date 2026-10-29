#!/bin/bash
# LEVAR O ROBÔ DO WHATSAPP PARA O SERVIDOR · GUIA Church · 29/10/2026
#
# No Mac o robô parava toda vez que a tampa fechava (o macOS dorme e leva o
# robô junto; em 28/10 a rodada das 19:58 não saiu). Este arquivo leva o robô,
# como ele está, para um servidor que nunca dorme:
#   1. confere a entrada no servidor (chave SSH deste Mac);
#   2. prepara o servidor (Node, usuário, firewall, serviço);
#   3. para o robô deste Mac (ele termina a mensagem que estiver saindo);
#   4. copia a pasta inteira: o código, o estado (o que já saiu em cada
#      grupo), a sessão do WhatsApp e o segredo. Nada disso aparece na tela;
#   5. liga o robô no servidor e confere os grupos;
#   6. desliga o robô deste Mac de vez (ele não volta sozinho ao ligar o Mac)
#      e troca o pausar e o retomar desta pasta pelos do servidor.
# Se o passo 5 falhar, o robô deste Mac volta a rodar como antes.
#
# Uso: levar-para-o-servidor.command <endereço do servidor>

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
DE="$(cd "$(dirname "$0")" && pwd)"
PARA="$HOME/robo-whatsapp-guia"
ROTULO="com.guiachurch.robo-whatsapp"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
EU="gui/$(id -u)"
LA=/home/robo/robo-whatsapp-guia
SSH_OPC=(-o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15)

passo() { printf '\n\033[1m%s\033[0m\n' "$1"; }
falha() { printf '\n\033[31mPAROU: %s\033[0m\n' "$1"; [ -t 0 ] && read -r -p "Aperte Enter para fechar. " _; exit 1; }

SERVIDOR="${1:-}"
[ -n "$SERVIDOR" ] || { [ -t 0 ] && read -r -p "Endereço do servidor (IP): " SERVIDOR; }
[[ "$SERVIDOR" =~ ^[A-Za-z0-9.:-]+$ ]] || falha "endereço do servidor inválido"
[ -f "$DE/servidor/configurar-servidor.sh" ] || falha "falta servidor/configurar-servidor.sh ao lado deste arquivo"
[ -f "$PARA/robo.mjs" ] || falha "não achei o robô instalado em $PARA"
[ -f "$PARA/NO-SERVIDOR" ] && falha "o robô já foi levado para o servidor $(head -1 "$PARA/NO-SERVIDOR")"

CODIGO=(package.json package-lock.json config.mjs regras.mjs rodada.mjs pedidos.mjs whatsapp.mjs robo.mjs qr.mjs LEIAME.md testes servidor)
for x in "${CODIGO[@]}"; do [ -e "$DE/$x" ] || falha "falta $x ao lado deste arquivo; nada mudou"; done

passo "1/6 · Entrando no servidor $SERVIDOR pela chave SSH deste Mac"
ssh "${SSH_OPC[@]}" "root@$SERVIDOR" true || falha "o servidor não aceitou a chave SSH deste Mac"

passo "2/6 · Preparando o servidor (leva uns minutos na primeira vez)"
ssh "${SSH_OPC[@]}" "root@$SERVIDOR" 'bash -s -- preparar' < "$DE/servidor/configurar-servidor.sh" || falha "a preparação do servidor falhou; nada mudou neste Mac"

passo "3/6 · Parando o robô deste Mac"
launchctl bootout "$EU/$ROTULO" 2>/dev/null && echo "pedido de parada enviado" || echo "não estava rodando"
for _ in $(seq 1 60); do
  pgrep -f "$PARA/robo.mjs" >/dev/null 2>&1 || break
  sleep 2
done
pgrep -f "$PARA/robo.mjs" >/dev/null 2>&1 && falha "o robô deste Mac não parou em 2 minutos; nada foi copiado"

voltar_ao_mac() {
  echo "Desfazendo: o robô volta a rodar neste Mac."
  ssh "${SSH_OPC[@]}" "root@$SERVIDOR" 'systemctl disable --now robo-whatsapp-guia 2>/dev/null; true' || true
  launchctl bootstrap "$EU" "$PLIST" 2>/dev/null || launchctl kickstart -k "$EU/$ROTULO" 2>/dev/null || true
}

passo "4/6 · Copiando o robô: o estado, a sessão e o segredo deste Mac, e o código novo"
# tar pela própria conexão SSH: nada passa por outro lugar, nada vai para a tela.
# O estado (o que já saiu em cada grupo), a sessão do WhatsApp e o segredo saem
# da pasta instalada; o código sai desta pasta (a versão nova, que roda no Linux).
ESTADO=()
for x in sessao .env estado.json estado.anterior.json grupos-fixos.json status.json logs .segredo-na-vercel; do
  [ -e "$PARA/$x" ] && ESTADO+=("$x")
done
if ! COPYFILE_DISABLE=1 tar -C "$PARA" -czf - --no-xattrs "${ESTADO[@]}" \
  | ssh "${SSH_OPC[@]}" "root@$SERVIDOR" "install -d -m 700 -o robo -g robo $LA && tar -C $LA --warning=no-unknown-keyword -xzf -"; then
  voltar_ao_mac
  falha "a cópia do estado falhou"
fi
if ! COPYFILE_DISABLE=1 tar -C "$DE" -czf - --no-xattrs "${CODIGO[@]}" \
  | ssh "${SSH_OPC[@]}" "root@$SERVIDOR" "tar -C $LA --warning=no-unknown-keyword -xzf - && chown -R robo:robo $LA"; then
  voltar_ao_mac
  falha "a cópia do código falhou"
fi

passo "5/6 · Ligando o robô no servidor"
if ! ssh "${SSH_OPC[@]}" "root@$SERVIDOR" "bash $LA/servidor/configurar-servidor.sh ligar"; then
  voltar_ao_mac
  falha "o robô não ligou no servidor; ele continua neste Mac, como antes"
fi

passo "6/6 · Desligando o robô deste Mac de vez"
QUANDO=$(date '+%Y-%m-%d-%H%M')
mkdir -p "$PARA/mac-desligado"
[ -f "$PLIST" ] && mv "$PLIST" "$PARA/mac-desligado/$ROTULO.plist"
[ -d "$PARA/sessao" ] && mv "$PARA/sessao" "$PARA/mac-desligado/sessao-levada-para-o-servidor-$QUANDO"
printf '%s\n' "$SERVIDOR" > "$PARA/NO-SERVIDOR"
for f in pausar.command retomar.command ver-o-robo.command configurar.command LEIAME.md robo.mjs; do
  [ -f "$DE/$f" ] && cp "$DE/$f" "$PARA/$f"
done
chmod +x "$PARA"/*.command 2>/dev/null
xattr -dr com.apple.quarantine "$PARA" 2>/dev/null || true
echo "Este Mac não liga mais o robô (nem depois de reiniciar)."

printf '\n\033[1mPronto.\033[0m O robô roda no servidor %s, que nunca dorme.\n' "$SERVIDOR"
echo "Pausar a qualquer hora: dois cliques em pausar.command (nesta pasta); ele pausa o servidor."
echo "Ver como está: dois cliques em ver-o-robo.command."
[ -t 0 ] && read -r -p "Aperte Enter para fechar. " _
exit 0
