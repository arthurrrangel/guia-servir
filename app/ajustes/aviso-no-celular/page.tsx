'use client';
/* =============================================================================
   /ajustes/aviso-no-celular — AS CHAVES DO AVISO NO CELULAR (104, 01/10/2026)

   O aviso no celular (web push) precisa de um par de chaves gravado nas
   variáveis do Vercel. O par nasce AQUI, no navegador de quem administra,
   com a criptografia do próprio navegador: nada sai desta tela, nem para o
   banco, nem para o servidor, nem para o agente que constrói o sistema. A
   chave privada é segredo, e por isso o caminho dela é só um: desta tela
   para o campo do Vercel, pela mão do Arthur.

   Depois de gravadas, `/api/aviso/chave` passa a devolver a pública, e o
   cartão "Aviso no celular" aparece no link de cada voluntário.
   ============================================================================= */
import Shell, { useApp } from '@/components/Shell';
import { useEffect, useState } from 'react';
import { Cab, Aviso } from '@/components/escalas/Pecas';
import { gerarParVapid } from '@/lib/chaves-aviso';

const VERCEL = 'https://vercel.com/arthurrrangels-projects/escala-midia/settings/environment-variables';

export default function Pagina() { return <Shell><Chaves /></Shell>; }

function Chaves() {
  const { aviso } = useApp();
  const [noServidor, setNoServidor] = useState<boolean | null>(null);
  const [par, setPar] = useState<{ pub: string; priv: string } | null>(null);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    fetch('/api/aviso/chave', { cache: 'no-store' }).then(r => r.json())
      .then(j => setNoServidor(!!j?.chave), () => setNoServidor(false));
  }, []);

  async function gerar() {
    setGerando(true);
    try {
      setPar(await gerarParVapid());
    } catch {
      aviso('Este navegador não gerou as chaves. Abra esta página no Chrome ou no Safari atualizado.');
    } finally { setGerando(false); }
  }
  const copiar = async (t: string, o: string) => {
    try { await navigator.clipboard.writeText(t); aviso(`${o} copiada. Cole no Vercel.`); }
    catch { aviso('Não consegui copiar. Selecione o texto e copie à mão.'); }
  };

  return (
    <>
      <Cab rot="Ajustes" titulo="Aviso no celular"
        meta="O par de chaves que deixa o servidor mandar aviso para o celular dos voluntários." />

      {noServidor === true && !par && (
        <Aviso tom="ok">
          As chaves já estão no Vercel: o aviso está ligado no servidor, e o cartão aparece no link de cada voluntário.
          Gerar de novo troca o par, e quem já ligou o aviso precisa ligar outra vez.
        </Aviso>
      )}

      <section className="es-caixa">
        <div className="es-caixa-cab"><h2>1. Gerar o par</h2></div>
        <div className="es-caixa-corpo es-aj-pilha">
          <p className="es-prosa">
            As chaves nascem aqui, no seu navegador. Nada desta tela vai para o banco nem para ninguém.
          </p>
          <div className="es-linha">
            <button className={`es-btn${noServidor ? '' : ' es-pri'}`} disabled={gerando} onClick={gerar}>
              {par ? 'Gerar outro par' : 'Gerar o par de chaves'}
            </button>
          </div>
        </div>
      </section>

      {par && (
        <section className="es-caixa">
          <div className="es-caixa-cab"><h2>2. Gravar no Vercel</h2></div>
          <div className="es-caixa-corpo es-aj-pilha">
            <p className="es-prosa">
              No Vercel, no projeto escala-midia: Settings, Environment Variables, Add. Crie as duas, marque
              Production e salve.
            </p>
            <label className="es-campo" htmlFor="vapid-pub">
              <span>VAPID_PUBLIC_KEY</span>
              <input className="es-ctl" id="vapid-pub" readOnly spellCheck={false} value={par.pub} onFocus={e => e.currentTarget.select()} />
            </label>
            <div className="es-linha">
              <button className="es-btn" onClick={() => copiar(par.pub, 'A chave pública')}>Copiar a pública</button>
            </div>
            <label className="es-campo" htmlFor="vapid-priv">
              <span>VAPID_PRIVATE_KEY</span>
              <input className="es-ctl" id="vapid-priv" readOnly spellCheck={false} value={par.priv} onFocus={e => e.currentTarget.select()} />
            </label>
            <div className="es-linha">
              <button className="es-btn" onClick={() => copiar(par.priv, 'A chave privada')}>Copiar a privada</button>
              <a className="es-btn" href={VERCEL} target="_blank" rel="noopener noreferrer">Abrir o Vercel</a>
            </div>
            <Aviso tom="warn">
              A chave privada é segredo: não mande em grupo, e-mail ou conversa, nem para o Claude. Ela só vai
              para o campo do Vercel.
            </Aviso>
          </div>
        </section>
      )}

      <section className="es-caixa">
        <div className="es-caixa-cab"><h2>3. Avisar que gravou</h2></div>
        <div className="es-caixa-corpo es-aj-pilha">
          <p className="es-prosa">
            Diga no chat que as duas estão no Vercel. O sistema é publicado de novo para ler as chaves, e o
            cartão &ldquo;Aviso no celular&rdquo; passa a aparecer no link de cada voluntário.
          </p>
        </div>
      </section>
    </>
  );
}
