'use client';
import { useEffect, useRef, useState } from 'react';
import {
  type ContaDoRecorte, type Estado, assinaturaDoEnvio, contaDoRecorte, gruposDoDia,
  hojeISO, linkDoVoluntario, msgEscala,
} from '@/lib/engine';
import { copiar } from '@/components/Shell';
import { Pilula } from '@/components/escalas/Pecas';
import { IcCopiar, IcEnviar } from '@/components/Icones';
import { cont, pl } from '@/lib/plural';

/* =============================================================================
   MANDAR NOS GRUPOS — 01/10/2026

   Pedido do Arthur: "o gestor copia uma única escala e manda só no grupo
   geral. O sistema poderia gerar a mensagem de cada grupo, já direcionada".

   O QUE O WHATSAPP DEIXA E O QUE NÃO DEIXA. Site nenhum posta num grupo
   comum, nem escolhe o grupo: o máximo é abrir o WhatsApp com o texto pronto
   (wa.me/?text=) e o líder tocar no grupo. Então cada linha daqui é um grupo,
   com o texto dele pronto: um toque abre o WhatsApp, outro escolhe o grupo.

   O QUE VAI EM CADA MENSAGEM. O geral recebe a escala inteira (com o
   plantão); cada grupo, só as funções dele, com as vagas da área (é ali que
   alguém pode cobrir). Todas fecham com o MESMO link do ministério, que leva
   cada pessoa à própria página para confirmar. Nunca o link pessoal de
   alguém: aquele é a chave da pessoa, e o grupo inteiro leria.

   A CONTA DE CADA LINHA usa as palavras do resumo do dia (leitura.ts):
   sem ninguém, furou, não pode, sem resposta. O mesmo posto não pode ter
   dois nomes na mesma tela.

   A MARCA DE ENVIADO. Fica neste aparelho, por dia e por grupo, com a hora
   (e a data, se não foi hoje). Se depois do envio alguém for trocado ou uma
   vaga abrir, a marca vira "mudou depois do envio": aquele grupo precisa da
   mensagem nova. Alguém confirmar, ou o líder renomear um posto, não conta.
   ============================================================================= */

type Envio = { em: number; ass: string };
const PREFIXO = 'escalas:enviado:';
const chaveEnvio = (eq: string, d: string) => `${PREFIXO}${eq}:${d}`;
function lerEnvios(eq: string, d: string): Record<string, Envio> {
  try {
    const v = JSON.parse(localStorage.getItem(chaveEnvio(eq, d)) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}
/* marca de dia que passou há mais de 90 dias não serve para nada: sai */
function podar() {
  try {
    const limite = Date.now() - 90 * 86400000;
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(PREFIXO)) continue;
      const d = k.slice(-10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Date.parse(d + 'T12:00:00') < limite) localStorage.removeItem(k);
    }
  } catch {}
}
function quando(t: number) {
  const dt = new Date(t);
  const h = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return iso === hojeISO() ? h : `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${h}`;
}
function descreve(c: ContaDoRecorte) {
  const p = [cont(c.postos, 'posto', 'postos')];
  if (c.vagas) p.push(`${c.vagas} sem ninguém`);
  if (c.furos) p.push(`${c.furos} ${pl(c.furos, 'furou', 'furaram')}`);
  if (c.recusados) p.push(`${c.recusados} ${pl(c.recusados, 'não pode', 'não podem')}`);
  if (c.semResposta) p.push(`${c.semResposta} sem resposta`);
  return p.join(' · ');
}

export default function MandarNosGrupos({ S, d, base, slug, equipeId, aviso, id }: {
  S: Estado; d: string; base: string; slug: string; equipeId: string;
  aviso: (t: string) => void; id: string;
}) {
  const [envios, setEnvios] = useState<Record<string, Envio>>(() => lerEnvios(equipeId, d));
  /* abriu pelo teclado: o foco entra no painel, e não três botões antes dele */
  const refCab = useRef<HTMLDivElement | null>(null);
  useEffect(() => { refCab.current?.focus({ preventScroll: true }); }, []);

  const link = linkDoVoluntario(base, slug, 'confirmar');
  const grupos = gruposDoDia(S, d);

  const marcar = (gid: string, ass: string) => {
    const novo = { ...lerEnvios(equipeId, d), [gid]: { em: Date.now(), ass } };
    try { localStorage.setItem(chaveEnvio(equipeId, d), JSON.stringify(novo)); } catch {}
    podar();
    setEnvios(novo);
  };

  const linhas = [
    {
      gid: 'geral', nome: 'Grupo geral', doGrupo: 'do grupo geral', noGrupo: 'no grupo geral',
      sub: `escala inteira · ${descreve(contaDoRecorte(S, d))}`,
      texto: msgEscala(S, d, { link }), ass: assinaturaDoEnvio(S, d), vazio: false,
    },
    ...grupos.map(x => ({
      gid: x.grupo.id, nome: x.grupo.nome,
      doGrupo: `do grupo ${x.grupo.nome}`, noGrupo: `no grupo ${x.grupo.nome}`,
      sub: x.funcoes.length ? descreve(x.conta) : 'nenhuma função deste grupo neste dia',
      texto: x.funcoes.length ? msgEscala(S, d, { link, grupo: x.grupo }) : '',
      ass: assinaturaDoEnvio(S, d, x.grupo), vazio: !x.funcoes.length,
    })),
  ];

  return (
    <div className="es-mg" id={id}>
      <div className="es-mg-cab" ref={refCab} tabIndex={-1}>
        <b>Mandar nos grupos</b>
        <span>
          O WhatsApp abre com a mensagem pronta: é só tocar no grupo. O link no fim
          leva cada pessoa à própria página para confirmar.
        </span>
      </div>

      <ul className="es-mg-lista">
        {linhas.map(l => {
          const e = envios[l.gid];
          const mudou = !!e && e.ass !== l.ass;
          return (
            <li key={l.gid} className={l.vazio ? 'es-mg-linha es-mg-vazio' : 'es-mg-linha'}>
              <span className="es-mg-tit">
                <b>{l.nome}</b>
                <small>{l.sub}</small>
              </span>
              {e && !l.vazio && (
                <span className="es-mg-est">
                  {mudou
                    ? <Pilula tom="warn">mudou depois do envio</Pilula>
                    : <Pilula tom="ok">enviado {quando(e.em)}</Pilula>}
                </span>
              )}
              {!l.vazio && (
                <span className="es-mg-acoes">
                  <a className="es-btn es-peq es-zap" target="_blank" rel="noopener"
                    href={`https://wa.me/?text=${encodeURIComponent(l.texto)}`}
                    aria-label={`Abrir o WhatsApp com a mensagem ${l.doGrupo}`}
                    onClick={() => marcar(l.gid, l.ass)}>
                    <IcEnviar />WhatsApp
                  </a>
                  <button type="button" className="es-btn es-txt es-peq"
                    aria-label={`Copiar a mensagem ${l.doGrupo}`}
                    onClick={async () => { if (await copiar(l.texto, aviso, `Copiado. Cole ${l.noGrupo}.`)) marcar(l.gid, l.ass); }}>
                    <IcCopiar />Copiar
                  </button>
                </span>
              )}
              {!l.vazio && (
                <details className="es-mg-texto">
                  {/* "Ver a mensagem": é o nome que o aviso de cópia que
                      falhou manda procurar (Shell.copiar) */}
                  <summary aria-label={`Ver a mensagem ${l.doGrupo}`}>Ver a mensagem</summary>
                  <pre className="es-msg">{l.texto}</pre>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      {!grupos.length && (
        <p className="es-mg-dica">
          O ministério tem um grupo para cada área (banda, vocal, som)?{' '}
          <a href="/ajustes#grupos">Marque as funções de cada grupo nos Ajustes</a>{' '}
          e cada um passa a receber só a parte dele.
        </p>
      )}
    </div>
  );
}
