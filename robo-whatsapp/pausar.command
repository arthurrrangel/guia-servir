#!/bin/bash
# PAUSAR O ROBÔ DO WHATSAPP · dois cliques e nada mais sai.
# O robô continua ligado ao número da igreja, só não manda nada.
# Vale de qualquer cópia deste arquivo: a pausa vai sempre para a pasta do
# robô instalado (~/robo-whatsapp-guia). Para voltar: retomar.command.
ROBO="$HOME/robo-whatsapp-guia"
if [ ! -d "$ROBO" ]; then
  echo "Não achei o robô instalado em $ROBO. Nada a pausar."
  sleep 4
  exit 1
fi
printf '%s pausado à mão\n' "$(date '+%Y-%m-%dT%H:%M:%S')" > "$ROBO/PAUSADO"
echo "Robô PAUSADO: nada sai até você rodar o retomar.command."
sleep 4
