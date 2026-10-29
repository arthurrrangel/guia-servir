#!/bin/bash
# O ROBÔ DO WHATSAPP NUM SERVIDOR SEMPRE LIGADO · GUIA Church · 29/10/2026
#
# Por quê: no MacBook o robô parava toda vez que a tampa fechava, porque o
# macOS dorme e leva o robô junto. Medido em 28/10: o Mac dormiu das 18:10 às
# 21:57 e a rodada das 19:58 não saiu. O Arthur escolheu um servidor que nunca
# dorme.
#
# Roda NO SERVIDOR (Ubuntu 24.04), como root. Quem chama é o
# levar-para-o-servidor.command, do Mac, por SSH:
#   preparar   Node 22, o usuário robo, firewall, atualizações de segurança,
#              memória de troca e o serviço do systemd (ainda desligado).
#              Pode rodar de novo: o que já está pronto ele pula.
#   ligar      depois de a pasta do robô chegar: bibliotecas, os três testes,
#              a conferência dos grupos e o serviço no ar.
#   parar      desliga o serviço (o robô termina a mensagem que estiver saindo).
#   status     o resumo do robô (node robo.mjs --status).
#   unidade    só mostra o arquivo do serviço do systemd (para conferir).
# O segredo do robô (.env) e a sessão do WhatsApp (sessao/) chegam do Mac por
# SSH e nunca aparecem na tela.

set -euo pipefail
export LC_ALL=C.UTF-8

USUARIO=robo
CASA=/home/$USUARIO
PASTA=$CASA/robo-whatsapp-guia
SERVICO=robo-whatsapp-guia
UNIDADE=/etc/systemd/system/$SERVICO.service
NODE_VERSAO=22.22.0

passo() { printf '\n== %s\n' "$1"; }
falha() { printf '\nPAROU: %s\n' "$1" >&2; exit 1; }
como_robo() { runuser -u "$USUARIO" -- env HOME="$CASA" PATH=/usr/local/bin:/usr/bin:/bin "$@"; }

unidade() {
  cat <<UNIT
[Unit]
Description=Robo do WhatsApp da escala (GUIA Church)
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$USUARIO
Group=$USUARIO
WorkingDirectory=$PASTA
Environment=ROBO_SERVICO=1
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/node $PASTA/robo.mjs
# como o launchd do Mac (KeepAlive, SuccessfulExit false): religa se cair,
# não religa quando para por pedido. O robô termina a mensagem que estiver
# saindo antes de sair (até 100 s).
Restart=on-failure
RestartSec=30
TimeoutStopSec=120
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
UNIT
}

preparar() {
  [ "$(id -u)" = 0 ] || falha "rode como root"
  grep -q 'VERSION_ID="24.04"' /etc/os-release || echo "aviso: feito para o Ubuntu 24.04; seguindo assim mesmo"

  passo "1/7 · Pacotes do sistema e atualizações de segurança automáticas"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl xz-utils tar ufw unattended-upgrades >/dev/null
  printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
  timedatectl set-timezone America/Sao_Paulo 2>/dev/null || true

  passo "2/7 · Node $NODE_VERSAO (o pacote oficial, conferido pela soma SHA-256)"
  if [ "$(/usr/local/bin/node -v 2>/dev/null || true)" != "v$NODE_VERSAO" ]; then
    case "$(uname -m)" in
      x86_64) ARQ=x64 ;;
      aarch64) ARQ=arm64 ;;
      *) falha "processador $(uname -m) não previsto" ;;
    esac
    TMP=$(mktemp -d)
    ARQUIVO=node-v$NODE_VERSAO-linux-$ARQ.tar.xz
    curl -fsSL -o "$TMP/$ARQUIVO" "https://nodejs.org/dist/v$NODE_VERSAO/$ARQUIVO"
    curl -fsSL -o "$TMP/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSAO/SHASUMS256.txt"
    (cd "$TMP" && grep " $ARQUIVO\$" SHASUMS256.txt | sha256sum -c --quiet -) || falha "o Node baixado não bate com a soma oficial"
    tar -xJf "$TMP/$ARQUIVO" -C /usr/local --strip-components=1 --no-same-owner
    rm -rf "$TMP"
  fi
  /usr/local/bin/node -v

  passo "3/7 · Memória de troca (o servidor tem 1 GB; a instalação das bibliotecas pede mais)"
  # a linha no fstab só entra se a troca ligou: uma linha para um arquivo que
  # não existe vira um erro a cada reinício
  if ! swapon --show | grep -q .; then
    if fallocate -l 1G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=1024 status=none; then
      if chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile; then
        grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
      else
        echo "aviso: não consegui ligar a memória de troca; segue sem ela"
      fi
    fi
  fi
  swapon --show | tail -n +2 || true

  passo "4/7 · O usuário $USUARIO (o robô não roda como root)"
  id "$USUARIO" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$USUARIO"
  install -d -m 700 -o "$USUARIO" -g "$USUARIO" "$CASA/.ssh" "$PASTA"
  if [ -s /root/.ssh/authorized_keys ]; then
    touch "$CASA/.ssh/authorized_keys"
    while IFS= read -r chave; do
      [ -n "$chave" ] && ! grep -qxF "$chave" "$CASA/.ssh/authorized_keys" && printf '%s\n' "$chave" >> "$CASA/.ssh/authorized_keys"
    done < /root/.ssh/authorized_keys
    chown "$USUARIO:$USUARIO" "$CASA/.ssh/authorized_keys"
    chmod 600 "$CASA/.ssh/authorized_keys"
  fi

  passo "5/7 · Entrada só por chave SSH (senha desligada)"
  if [ -s /root/.ssh/authorized_keys ]; then
    printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-robo.conf
    sshd -t && (systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true)
  else
    echo "aviso: sem chave em /root/.ssh/authorized_keys; a senha continua ligada"
  fi

  passo "6/7 · Firewall: só SSH entra (o robô só faz conexões de saída)"
  ufw allow OpenSSH >/dev/null
  ufw --force enable >/dev/null
  ufw status | head -5

  passo "7/7 · O serviço do systemd (desligado até a pasta do robô chegar)"
  unidade > "$UNIDADE"
  systemctl daemon-reload
  echo "pronto para receber a pasta do robô em $PASTA"
}

ligar() {
  [ "$(id -u)" = 0 ] || falha "rode como root"
  [ -f "$PASTA/robo.mjs" ] || falha "a pasta do robô não chegou em $PASTA"
  [ -f "$UNIDADE" ] || falha "rode antes: configurar-servidor.sh preparar"

  passo "1/5 · Dono e permissões (o segredo e a sessão só para o robo)"
  chown -R "$USUARIO:$USUARIO" "$PASTA"
  chmod 700 "$PASTA"
  [ -f "$PASTA/.env" ] && chmod 600 "$PASTA/.env"
  [ -d "$PASTA/sessao" ] && chmod -R go-rwx "$PASTA/sessao"
  rm -f "$PASTA/NO-SERVIDOR" "$PASTA/robo.pid" "$PASTA/estado.trava"
  grep -q '^ROBO_WHATSAPP_SEGREDO=' "$PASTA/.env" 2>/dev/null || falha "o segredo do robô (.env) não chegou"
  [ -f "$PASTA/sessao/creds.json" ] || falha "a sessão do WhatsApp (sessao/) não chegou"

  passo "2/5 · Bibliotecas (as mesmas versões do package-lock)"
  if ! cmp -s "$PASTA/package-lock.json" "$PASTA/node_modules/.lock-instalado" 2>/dev/null; then
    (cd "$PASTA" && como_robo npm ci --omit=dev --no-audit --no-fund --loglevel=error) || falha "a instalação das bibliotecas falhou"
    como_robo cp "$PASTA/package-lock.json" "$PASTA/node_modules/.lock-instalado"
  fi

  passo "3/5 · Os três testes do robô"
  (cd "$PASTA" && como_robo node testes/regras.test.mjs && como_robo node testes/whatsapp.test.mjs && como_robo node testes/pedidos.test.mjs) \
    || falha "os testes do robô falharam"

  passo "4/5 · Conferência dos grupos (com o serviço parado)"
  systemctl stop "$SERVICO" 2>/dev/null || true
  (cd "$PASTA" && como_robo node robo.mjs --grupos) || falha "não consegui conferir os grupos"

  passo "5/5 · O serviço no ar (e de novo depois de cada reinício do servidor)"
  systemctl enable --now "$SERVICO" >/dev/null 2>&1 || systemctl enable --now "$SERVICO"
  sleep 25
  systemctl is-active --quiet "$SERVICO" || falha "o serviço não ficou no ar (journalctl -u $SERVICO)"
  (cd "$PASTA" && como_robo node robo.mjs --status) | head -12
}

case "${1:-}" in
  preparar) preparar ;;
  ligar) ligar ;;
  parar) systemctl stop "$SERVICO"; systemctl is-active "$SERVICO" || true ;;
  status) cd "$PASTA" && como_robo node robo.mjs --status ;;
  unidade) unidade ;;
  *) echo "uso: $0 preparar|ligar|parar|status|unidade" >&2; exit 2 ;;
esac
