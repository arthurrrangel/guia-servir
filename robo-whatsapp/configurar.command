#!/bin/bash
# CONFIGURAR O ROBÔ DO WHATSAPP · GUIA Church · 26/10/2026
#
# Dois cliques neste arquivo. Ele:
#   1. para o robô, se estiver rodando;
#   2. instala o robô em ~/robo-whatsapp-guia (bibliotecas e testes);
#   3. cria o segredo do robô e guarda na Vercel (o sistema só responde a quem tem);
#   4. liga o robô ao WhatsApp da igreja (QR code no celular da igreja);
#   5. deixa o robô rodando sozinho neste Mac (serviço do macOS).
# Pode rodar de novo quantas vezes quiser: o que já está pronto ele pula.
# O segredo nunca aparece na tela e nunca sai deste Mac, a não ser para a Vercel.

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
DE="$(cd "$(dirname "$0")" && pwd)"
PARA="$HOME/robo-whatsapp-guia"
ROTULO="com.guiachurch.robo-whatsapp"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
EU="gui/$(id -u)"

passo() { printf '\n\033[1m%s\033[0m\n' "$1"; }
falha() {
  printf '\n\033[31mPAROU: %s\033[0m\n' "$1"
  echo "Nada foi mandado em grupo nenhum. Avise o Claude com uma foto desta janela."
  read -r -p "Aperte Enter para fechar. " _
  exit 1
}

NODE="$(command -v node || true)"
[ -n "$NODE" ] || falha "não achei o Node neste Mac"
command -v npm >/dev/null || falha "não achei o npm"
command -v vercel >/dev/null || falha "não achei a Vercel CLI (vercel)"
command -v openssl >/dev/null || falha "não achei o openssl"

passo "1/5 · Parando o robô, se estiver rodando"
launchctl bootout "$EU/$ROTULO" 2>/dev/null && echo "pedido de parada enviado" || echo "não estava rodando"
# espera a última mensagem que estiver saindo terminar (até 2 minutos)
for _ in $(seq 1 60); do
  pgrep -f "$PARA/robo.mjs" >/dev/null 2>&1 || break
  sleep 2
done
pgrep -f "$PARA/robo.mjs" >/dev/null 2>&1 && falha "o robô não parou em 2 minutos"
rm -f "$PARA/robo.pid" "$PARA/estado.trava"

passo "2/5 · Instalando o robô em $PARA"
mkdir -p "$PARA/testes" "$PARA/logs"
if [ "$DE" != "$PARA" ]; then
  for f in package.json package-lock.json config.mjs regras.mjs rodada.mjs whatsapp.mjs robo.mjs \
           LEIAME.md configurar.command pausar.command retomar.command; do
    cp "$DE/$f" "$PARA/$f" || falha "não consegui copiar $f"
  done
  cp "$DE/testes/regras.test.mjs" "$DE/testes/whatsapp.test.mjs" "$PARA/testes/" || falha "não consegui copiar os testes"
fi
chmod +x "$PARA"/*.command
# arquivos que vieram de fora ganham a "quarentena" do macOS, que pode
# bloquear o pausar.command na hora em que ele for preciso
xattr -dr com.apple.quarantine "$PARA" 2>/dev/null || true
cd "$PARA" || falha "não consegui entrar em $PARA"
if ! cmp -s package-lock.json node_modules/.lock-instalado 2>/dev/null; then
  npm ci --omit=dev --no-audit --no-fund || falha "a instalação das bibliotecas falhou"
  cp package-lock.json node_modules/.lock-instalado
fi
node testes/regras.test.mjs && node testes/whatsapp.test.mjs || falha "os testes do robô falharam"

passo "3/5 · Segredo do robô (fica neste Mac e na Vercel, nunca na tela)"
umask 077
if ! grep -q '^ROBO_WHATSAPP_SEGREDO=' .env 2>/dev/null; then
  printf 'ROBO_WHATSAPP_SEGREDO=%s\n' "$(openssl rand -hex 32)" > .env
fi
chmod 600 .env
SEG="$(sed -n 's/^ROBO_WHATSAPP_SEGREDO=//p' .env | head -1)"
[ "${#SEG}" -ge 32 ] || falha "o segredo ficou curto"
MARCA="$(printf %s "$SEG" | shasum -a 256 | cut -c1-16)"
if [ "$(cat .segredo-na-vercel 2>/dev/null)" != "$MARCA" ]; then
  # a pasta aponta para o projeto escala-midia sem "vercel link" (que poderia
  # baixar as variáveis do projeto para cá)
  mkdir -p .vercel
  printf '{"projectId":"prj_Q2d290c762EHioPxPmCWFfcH6L5r","orgId":"team_MJSLW2xVwRAbId8vgM77swPG"}\n' > .vercel/project.json
  printf %s "$SEG" | vercel env add ROBO_WHATSAPP_SEGREDO production --sensitive --force --yes >/dev/null 2>&1 \
    || falha "a Vercel não aceitou o segredo (a Vercel CLI está logada?)"
  vercel env ls production 2>/dev/null | grep -q ROBO_WHATSAPP_SEGREDO || falha "o segredo não apareceu na Vercel"
  echo "$MARCA" > .segredo-na-vercel
  echo "Segredo novo guardado na Vercel. O Claude publica o sistema de novo para ele valer."
else
  echo "O segredo já estava na Vercel."
fi
unset SEG

passo "4/5 · Ligar o robô ao WhatsApp da igreja"
# pareado de verdade = o WhatsApp devolveu a conta (um pareamento interrompido
# deixa sessao/creds.json sem ela)
PAREADO=0
node -e 'const c=JSON.parse(require("fs").readFileSync("sessao/creds.json","utf8"));process.exit(c&&c.account&&c.me&&c.me.id?0:1)' 2>/dev/null && PAREADO=1
if [ "$PAREADO" != 1 ] || [ -f PRECISA-PAREAR ]; then
  echo "Pegue o CELULAR DA IGREJA (+55 21 97297-6946), com o WhatsApp Business aberto."
  echo "Vai aparecer um QR code aqui. No celular: Configurações > Dispositivos conectados > Conectar dispositivo,"
  echo "e aponte a câmera para o QR. (Se o celular disser que já tem aparelhos demais, desconecte um antigo.)"
  read -r -p "Aperte Enter quando estiver com o celular da igreja na mão... " _
  node robo.mjs --parear || falha "o pareamento não terminou"
else
  echo "Já está ligado. Conferindo os grupos..."
  node robo.mjs --grupos || falha "não consegui conferir os grupos. Rode o configurar.command de novo; se repetir, avise o Claude"
fi

passo "5/5 · Deixar o robô rodando sozinho neste Mac"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ROTULO</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$PARA/robo.mjs</string></array>
  <key>WorkingDirectory</key><string>$PARA</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ROBO_SERVICO</key><string>1</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ExitTimeOut</key><integer>120</integer>
  <key>StandardOutPath</key><string>$PARA/logs/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$PARA/logs/launchd.err.log</string>
</dict>
</plist>
PLIST
plutil -lint "$PLIST" >/dev/null || falha "o arquivo do serviço ficou inválido"
launchctl bootstrap "$EU" "$PLIST" 2>/dev/null || launchctl kickstart -k "$EU/$ROTULO" || falha "o macOS não aceitou o serviço"
echo "Esperando o robô conectar..."
sleep 25
node robo.mjs --status

printf '\n\033[1mPronto.\033[0m O robô roda sozinho enquanto o Mac estiver com a tampa aberta.\n'
echo "Pausar a qualquer hora: dois cliques em pausar.command (na pasta robo-whatsapp-guia)."
echo "Avise o Claude que terminou."
read -r -p "Aperte Enter para fechar. " _
