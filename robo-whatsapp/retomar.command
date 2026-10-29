#!/bin/bash
# RETOMAR O ROBÔ DO WHATSAPP · dois cliques e ele volta a mandar na próxima rodada.
# Vale de qualquer cópia deste arquivo: age sempre no robô de verdade (no
# servidor, desde 29/10/2026, quando a pasta do Mac tem o arquivo NO-SERVIDOR).
ROBO="$HOME/robo-whatsapp-guia"
if [ -f "$ROBO/NO-SERVIDOR" ]; then
  SERVIDOR="$(head -1 "$ROBO/NO-SERVIDOR")"
  if ssh -o BatchMode=yes -o ConnectTimeout=15 "robo@$SERVIDOR" \
      'if [ -f robo-whatsapp-guia/PAUSADO ]; then echo "Estava pausado: $(cat robo-whatsapp-guia/PAUSADO)"; rm -f robo-whatsapp-guia/PAUSADO; fi'; then
    echo "Robô de volta no servidor ($SERVIDOR): sai na próxima rodada (09:00, 12:00 ou 19:58)."
  else
    echo "Não consegui falar com o servidor ($SERVIDOR). Confira a internet e tente de novo."
    echo "Se repetir, avise o Claude."
  fi
  sleep 5
  exit 0
fi
if [ -f "$ROBO/PAUSADO" ]; then
  echo "Estava pausado: $(cat "$ROBO/PAUSADO")"
  rm -f "$ROBO/PAUSADO"
fi
echo "Robô de volta: sai na próxima rodada (09:00, 12:00 ou 19:58)."
sleep 4
