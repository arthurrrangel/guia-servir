import type { Metadata } from 'next';
import Link from 'next/link';
import { Simbolo } from '@/components/Marca';
import { IGREJA } from '@/lib/igreja';
import { NOMES_AREAS, listaDeNomes } from '@/lib/site/areas';

/* =============================================================================
   404 — a página que ninguém planeja e todo mundo acaba vendo

   Mora na raiz (o Next só aceita o not-found global aqui). Ela NÃO importa
   site.css de propósito: qualquer folha importada aqui entra no bundle da
   raiz e vai junto em toda tela do sistema. Então o desenho é em linha, na
   identidade do site (noite, duas vozes, pílulas), com as fontes do site.
   Diz quem somos, quando nos reunimos e por onde entrar. Não pede desculpa.
   ============================================================================= */
/* o título sem o "· GUIA Church" do modelo: a mesma página atende os dois domínios */
export const metadata: Metadata = { title: { absolute: 'Página não encontrada' }, robots: { index: false, follow: true } };

const CSS = `
@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;font-display:swap;src:url(/tipos/inter.woff2) format("woff2")}
@font-face{font-family:"Instrument Serif";font-style:italic;font-weight:400;font-display:swap;src:url(/tipos/instrument-serif-italic.woff2) format("woff2")}
.nf{min-height:100vh;display:flex;flex-direction:column;background:#111113;color:#f5f5f2;font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-weight:300;-webkit-font-smoothing:antialiased}
.nf *{box-sizing:border-box}
.nf a{color:inherit;text-decoration:none}
.nf-topo{height:72px;display:flex;align-items:center;padding:0 clamp(20px,3.6vw,56px);border-bottom:1px solid rgba(255,255,255,.06)}
.nf-topo a{display:flex;align-items:center;height:44px;padding:0 4px;margin-left:-4px}
.nf-topo svg{height:36px;width:auto}
.nf-in{flex:1;display:flex;flex-direction:column;justify-content:center;padding:clamp(48px,8vw,96px) clamp(20px,3.6vw,56px);max-width:1400px;width:100%;margin-inline:auto}
.nf .nf-chapeu{margin:0 0 clamp(18px,2.6vw,36px);font-size:clamp(15px,1.25vw,18px);display:flex;gap:10px;align-items:center}
.nf .nf-chapeu b{font-weight:700;color:#e9942f}
.nf .nf-chapeu i{width:6px;height:6px;border-radius:50%;background:#e9942f;display:inline-block}
.nf h1{margin:0;font-weight:800;font-size:clamp(46px,6.6vw,96px);letter-spacing:-.045em;line-height:.95}
.nf h1 em{display:block;font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400;letter-spacing:-.015em;font-size:1.06em;line-height:.9}
.nf p{margin:clamp(22px,3vw,40px) 0 0;max-width:42ch;font-size:clamp(20px,2.2vw,31px);line-height:1.3;letter-spacing:-.012em}
.nf-acoes{display:flex;flex-wrap:wrap;gap:14px 18px;margin-top:clamp(30px,4.4vw,60px)}
.nf a.nf-pil{display:inline-flex;align-items:center;height:46px;padding:0 28px;border-radius:999px;background:#f5f5f2;color:#141414;font-weight:500;font-size:clamp(16px,1.3vw,19px);letter-spacing:-.015em}
.nf .nf-micro{max-width:none;margin-top:clamp(16px,2.2vw,28px);font-size:clamp(14px,1.2vw,17px);color:rgba(255,255,255,.7)}
.nf .nf-micro a{color:#f5f5f2;font-weight:500;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
.nf :focus-visible{outline:2px solid #e9942f;outline-offset:3px}
html[data-nf="servir"] .nf-igreja,html:not([data-nf="servir"]) .nf-servir{display:none}
.nf a{transition:opacity .22s cubic-bezier(.2,.7,.2,1),transform .22s cubic-bezier(.2,.7,.2,1),box-shadow .22s cubic-bezier(.2,.7,.2,1)}
@media(hover:hover){.nf a.nf-pil:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(0,0,0,.22)}.nf .nf-topo a:hover,.nf .nf-micro a:hover{opacity:.7}}
.nf a.nf-pil:active{transform:scale(.97)}
`;

/* 21/10/2026: UM 404 POR SITE. O mesmo arquivo atende os dois domínios, e no
   guiaservir.com o 404 falava do domingo e mandava para os cultos: quem errou
   um endereço do Servir saía do Servir. A primeira versão lia o host no
   servidor (headers()) e isso tornava TODAS as páginas dos sites dinâmicas (o
   not-found da raiz é a borda de toda rota; o build passou de ○ para ƒ).
   Agora as duas versões vêm no HTML estático e um script de uma linha, antes
   da pintura, marca <html data-nf="servir"> no guiaservir.com; a folha acima
   esconde a outra (o <html> já tem suppressHydrationWarning). O guiafollow.com
   nunca chega aqui: lá todo caminho desconhecido volta para a raiz. */
const QUAL_SITE = `if(/(^|\\.)guiaservir\\.com$/i.test(location.hostname))document.documentElement.setAttribute('data-nf','servir')`;

export default function NaoEncontrada() {
  /* um h1 só, com as duas frases dentro: a folha mostra a do site (a outra,
     display:none, também sai do nome acessível do título) */
  return (
    <div className="nf">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script dangerouslySetInnerHTML={{ __html: QUAL_SITE }} />
      <header className="nf-topo"><Link href="/" aria-label="Ir para o início"><Simbolo /></Link></header>
      <main className="nf-in">
        <p className="nf-chapeu"><b>404</b><i aria-hidden="true" /><span>Esse endereço não existe</span></p>
        <h1>
          <span className="nf-servir">Mas o seu lugar pra servir <em>existe.</em></span>
          <span className="nf-igreja">Mas o domingo <em>existe.</em></span>
        </h1>
        <div className="nf-servir">
          <p>{listaDeNomes(NOMES_AREAS)}. Comece por aqui.</p>
          <div className="nf-acoes">
            <Link href="/" className="nf-pil">Ir para o início</Link>
            <Link href="/#areas" className="nf-pil">Ver as áreas</Link>
          </div>
          {/* /eu é sistema (outra folha): link inteiro, não <Link> */}
          <p className="nf-micro">Já serve? <a href="/eu">Abrir meu espaço</a>.</p>
        </div>
        <div className="nf-igreja">
          <p>{IGREJA.cultoDia}, {IGREJA.cultoHora}, na {IGREJA.rua}, {IGREJA.bairro}. Comece por aqui.</p>
          <div className="nf-acoes">
            <Link href="/" className="nf-pil">Ir para o início</Link>
            <Link href="/cultos" className="nf-pil">Ver os cultos</Link>
          </div>
          {/* 19/10/2026: era o "Cultivando uma nova cultura", que a copy final
              tirou de todas as páginas (fica só no rodapé do site) */}
          <p className="nf-micro">Existe um lugar para você.</p>
        </div>
      </main>
    </div>
  );
}
