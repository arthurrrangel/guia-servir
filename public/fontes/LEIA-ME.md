# Fontes da marca — esta pasta é preenchida no build

Os `.woff2` da PP Neue Montreal e da PP Editorial New **não ficam no
repositório**: são licenciados, e o repositório é público. Eles chegam aqui
no momento do build, baixados de uma origem privada por `scripts/fontes.mjs`.

Configuração, no painel da Vercel (Settings → Environment Variables):

| variável        | valor                                                                 |
|-----------------|-----------------------------------------------------------------------|
| `FONTES_ORIGEM` | URL-base do repositório privado, ex. `https://raw.githubusercontent.com/<conta>/guia-fontes/main` |
| `FONTES_TOKEN`  | token de leitura **só daquele repositório** (fine-grained, Contents: read) |

O repositório privado precisa conter exatamente:

```
pp-neue-montreal-book.woff2
pp-neue-montreal-bold.woff2
pp-editorial-new-ultralight-italic.woff2
fontes.sha256          (opcional — saída de `shasum -a 256 pp-*.woff2`)
```

Para gerar esses três a partir dos originais comprados: `scripts/fontes-preparar.sh`.

Sem as variáveis, o build passa e o site usa a pilha de fallback.
