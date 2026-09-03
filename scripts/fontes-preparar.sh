#!/usr/bin/env bash
# =============================================================================
# PREPARAR AS FONTES LICENCIADAS PARA A WEB — roda UMA vez, na máquina de quem
# comprou a licença, nunca no servidor e nunca dentro deste repositório.
#
# Entrada: os arquivos originais que a Pangram Pangram entrega (OTF/TTF/WOFF2)
#          numa pasta qualquer, fora do repositório.
# Saída:   os três .woff2 SUBSETADOS + fontes.sha256, prontos para subir no
#          repositório PRIVADO que o build lê (ver scripts/fontes.mjs).
#
# POR QUE SUBSETAR, E NÃO SÓ CONVERTER
# A fonte completa tem cirílico, grego, símbolos, ligaturas que o site nunca
# usa. Cortar para latim reduz cada arquivo em 5 a 10 vezes — o site carrega
# mais rápido — e, junto, o arquivo servido deixa de ser uma fonte reutilizável
# por terceiros: é um recorte que só serve para este site. Não é o que torna
# o uso legal (isso é a licença), mas é o que um licenciado cuidadoso faz.
#
# USO
#   ./scripts/fontes-preparar.sh  <pasta-com-os-originais>  <pasta-de-saida>
#
# Precisa de: python3 + fonttools + brotli  (pip install fonttools brotli)
# =============================================================================
set -euo pipefail

ORIG="${1:?pasta com os originais}"
SAIDA="${2:?pasta de saída}"
mkdir -p "$SAIDA"

# latim básico + latim-1 + latim estendido A + pontuação tipográfica + moeda.
# Cobre português inteiro (ã õ ç é ê …), aspas curvas, travessão, reticências.
UNICODES="U+0000-00FF,U+0100-017F,U+2000-206F,U+20A0-20CF,U+2122,U+2190-2199,U+2212,U+FEFF,U+FFFD"

subset() {
  local entrada="$1" saida="$2"
  pyftsubset "$entrada" \
    --unicodes="$UNICODES" \
    --flavor=woff2 \
    --layout-features='kern,liga,calt,pnum,lnum,tnum,ss01' \
    --no-hinting \
    --desubroutinize \
    --output-file="$saida"
  printf '  %-44s %6.1f kB\n' "$(basename "$saida")" "$(echo "scale=1; $(stat -f%z "$saida" 2>/dev/null || stat -c%s "$saida") / 1024" | bc)"
}

acha() {  # primeiro arquivo cujo nome case (sem diferenciar maiúsculas)
  find "$ORIG" -maxdepth 2 -type f \( -iname "*.otf" -o -iname "*.ttf" -o -iname "*.woff2" -o -iname "*.woff" \) \
    | grep -i -E "$1" | head -1
}

echo "Subsetando para $SAIDA"
subset "$(acha 'neue.?montreal.*book')"                       "$SAIDA/pp-neue-montreal-book.woff2"
subset "$(acha 'neue.?montreal.*bold' | grep -vi italic)"     "$SAIDA/pp-neue-montreal-bold.woff2"
subset "$(acha 'editorial.?new.*ultralight.*italic')"         "$SAIDA/pp-editorial-new-ultralight-italic.woff2"

( cd "$SAIDA" && shasum -a 256 pp-*.woff2 > fontes.sha256 )
echo
echo "Pronto. Suba o conteúdo de $SAIDA no repositório PRIVADO de fontes."
echo "Nunca no guia-servir — ele é público, e o EULA proíbe."
