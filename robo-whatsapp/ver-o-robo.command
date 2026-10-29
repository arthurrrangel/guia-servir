#!/bin/bash
# VER COMO ESTÁ O ROBÔ DO WHATSAPP · dois cliques, só leitura.
# Conexão com o número da igreja, pausa, última e próxima rodada, os grupos e
# o que saiu em cada um. Com o robô no servidor (desde 29/10/2026), pergunta
# ao servidor, pela chave SSH deste Mac.
ROBO="$HOME/robo-whatsapp-guia"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
if [ -f "$ROBO/NO-SERVIDOR" ]; then
  SERVIDOR="$(head -1 "$ROBO/NO-SERVIDOR")"
  echo "Robô no servidor $SERVIDOR:"
  ssh -o BatchMode=yes -o ConnectTimeout=15 "robo@$SERVIDOR" \
    'cd robo-whatsapp-guia && node robo.mjs --status && echo && echo "Últimas linhas do registro:" && tail -15 logs/robo.log' \
    || echo "Não consegui falar com o servidor ($SERVIDOR)."
else
  cd "$ROBO" && node robo.mjs --status && echo && echo "Últimas linhas do registro:" && tail -15 logs/robo.log
fi
echo
read -r -p "Aperte Enter para fechar. " _
