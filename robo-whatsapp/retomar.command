#!/bin/bash
# RETOMAR O ROBÔ DO WHATSAPP · dois cliques e ele volta a mandar na próxima rodada.
# Vale de qualquer cópia deste arquivo: age sempre no robô instalado (~/robo-whatsapp-guia).
ROBO="$HOME/robo-whatsapp-guia"
if [ -f "$ROBO/PAUSADO" ]; then
  echo "Estava pausado: $(cat "$ROBO/PAUSADO")"
  rm -f "$ROBO/PAUSADO"
fi
echo "Robô de volta: sai na próxima rodada (09:00, 12:00 ou 19:58)."
sleep 4
