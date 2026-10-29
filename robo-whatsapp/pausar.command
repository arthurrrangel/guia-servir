#!/bin/bash
# PAUSAR O ROBÔ DO WHATSAPP · dois cliques e nada mais sai.
# O robô continua ligado ao número da igreja, só não manda nada.
# Vale de qualquer cópia deste arquivo: a pausa vai sempre para o robô de
# verdade. Com o robô no servidor (o arquivo NO-SERVIDOR na pasta do Mac,
# desde 29/10/2026), a pausa vai para o servidor, pela chave SSH deste Mac.
# Para voltar: retomar.command.
ROBO="$HOME/robo-whatsapp-guia"
QUANDO="$(date '+%Y-%m-%dT%H:%M:%S')"
if [ -f "$ROBO/NO-SERVIDOR" ]; then
  SERVIDOR="$(head -1 "$ROBO/NO-SERVIDOR")"
  if ssh -o BatchMode=yes -o ConnectTimeout=15 "robo@$SERVIDOR" \
      "printf '%s pausado à mão (pelo Mac)\n' '$QUANDO' > robo-whatsapp-guia/PAUSADO"; then
    echo "Robô PAUSADO no servidor ($SERVIDOR): nada sai até você rodar o retomar.command."
  else
    echo "Não consegui falar com o servidor ($SERVIDOR). Confira a internet e tente de novo."
    echo "Se repetir, avise o Claude."
  fi
  sleep 5
  exit 0
fi
if [ ! -d "$ROBO" ]; then
  echo "Não achei o robô instalado em $ROBO. Nada a pausar."
  sleep 4
  exit 1
fi
printf '%s pausado à mão\n' "$QUANDO" > "$ROBO/PAUSADO"
echo "Robô PAUSADO: nada sai até você rodar o retomar.command."
sleep 4
