'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { MESES } from '@/lib/engine';
import { Aviso } from '@/components/Ui';
import { IcCheck, IcSeta } from '@/components/Icones';
import { Logo } from '@/components/Marca';
import { quemSou, outrasAreas, organiza, type Identidade } from '@/lib/identidade';
import { aviseHumano } from '@/lib/erros';

type Item = {
  culto_id: string; data: string; funcao: string; status: string; obs: string | null;
  plantao: boolean; primeira_vez?: boolean;
  /* quando esta hessoa entrou nesta vaga (migração 38). Null nas escalações
     anteriores à migração: null é "não sei", nunca "é antigo". */
  escalado_em?: string | null;
  /* posto de líder do dia: quem está aqui escreve o relatório no fim do culto */
  relata?: boolean; relatorio?: string | null; problemas?: string | null;
};
/* quem mais está escalado no MESMO dia, na mesma área: nome e função, sem
   telefone. Ver supabase/40-quem-serve-com-voce.sql para o porquê. */
type Junto = { nome: string; funcao: string; eu: boolean; status: string };

/* quem pode cobrir a vaga que a hessoa acabou de deixar */
type Cobre = { nome: string; telefone: string; nivel: string; disse_que_pode: boolean };

/* sábado é o culto do Follow. Escrever "domingo" num sábado é o tipo de erro
   que faz a hessoa aparecer no dia errado. */
const ehSabado = (s: string) => new Date(s + 'T12:00:00Z').getUTCDay() === 6;
const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  .toISOString().slice(0, 10);
/* na lista e na grade a data aparece dez vezes: por extenso vira parede.
   "dom 30/08" e "sáb 29/08 (Follow)" dizem o mesmo em um terço do espaço. */
const diaCurto = (s: string) => {
  const dt = new Date(s + 'T12:00:00Z');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return ehSabado(s) ? `sáb ${d}/${m} · Follow` : `dom ${d}/${m}`;
};
const diaLongo = (s: string) => {
  const dt = new Date(s + 'T12:00:00Z');
  const q = ehSabado(s) ? 'sábado (Follow)' : 'domingo';
  return `${q}, ${dt.getUTCDate()} de ${MESES[dt.getUTCMonth()]}`;
};


/* O relatório é do LÍDER ESCALADO, não do líder do app: quem viveu o culto é
   quem sabe como foi. Por isso ele aparece aqui, no link hessoal, no celular
   da hessoa, e só depois que o culto começou. Pedir antes do dia é como o
   formulário morre. */
function Relatorio({ item, token, aoSalvar }: { item: Item; token: string; aoSalvar: () => void }) {
  const [texto, setTexto] = useState(item.relatorio || '');
  const [probs, setProbs] = useState(item.problemas || '');
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar() {
    setSalvando(true); setErro(''); setOk(false);
    const { error } = await sb()!.rpc('eu_relatorio', {
      p_token: token, p_culto_id: item.culto_id, p_texto: texto, p_problemas: probs,
    });
    if (error) setErro(aviseHumano(error, 'salvar'));
    else { setOk(true); aoSalvar(); setTimeout(() => setOk(false), 3000); }
    setSalvando(false);
  }

  const jaTinha = !!(item.relatorio || item.problemas);
  return (
    <div className="relatorio">
      <span className="overline eu-lbl">{jaTinha ? 'Relatório enviado' : 'Relatório do dia'}</span>
      <p className="dim pequeno" style={{ margin: '2px 0 12px' }}>
        Você é líder deste culto. No fim, conta aqui como foi. Quem lidera no próximo
        domingo lê isso antes de começar.
      </p>
      <label htmlFor={'rel' + item.culto_id}>Como foi o andamento do trabalho</label>
      <textarea id={'rel' + item.culto_id} rows={3} value={texto}
        onChange={e => setTexto(e.target.value)}
        placeholder="Equipe completa, tudo tranquilo." />
      <div style={{ height: 12 }} />
      <label htmlFor={'prob' + item.culto_id}>Algum defeito ou falta de material</label>
      <textarea id={'prob' + item.culto_id} rows={2} value={probs}
        onChange={e => setProbs(e.target.value)}
        placeholder="Banheiro masculino sem papel. Bebedouro vazando." />
      {!salvando && !texto.trim() && !probs.trim() && (
        <p className="postos-falta" role="status">
          Escreva helo menos um dos dois campos. Se o dia foi tranquilo, escrever isso
          já ajuda quem lidera no próximo.
        </p>
      )}
      <div className="linha" style={{ marginTop: 12 }}>
        <button className="pri" disabled={salvando || (!texto.trim() && !probs.trim())} onClick={salvar}>
          {salvando ? 'Salvando...' : jaTinha ? 'Atualizar relatório' : 'Enviar relatório'}
        </button>
        {ok && <span className="pill ok"><IcCheck /> salvo</span>}
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}

export default function Eu() {
  const { token } = useParams<{ token: string }>();
  const [nome, setNome] = useState('');
  const [equipe, setEquipe] = useState('');
  const [itens, setItens] = useState<Item[]>([]);
  const [indisp, setIndisp] = useState<string[]>([]);
  const [disponivel, setDisponivel] = useState<string[]>([]);
  const [cobrem, setCobrem] = useState<Record<string, Cobre[]>>({});
  const [domingos, setDomingos] = useState<string[]>([]);
  /* QUEM SERVE COM VOCÊ — fase 7. Chega depois da tela, e some sozinho se a
     função ainda não existir no banco: nenhuma tela quebra por causa disto. */
  const [juntos, setJuntos] = useState<Junto[]>([]);
  /* MEU ESPAÇO (§13, §14): perfil, função, primeiros passos e contato do líder.
     Vem de `eu_espaco`, função nova ao lado da `eu_dados` que a tela já usava —
     trocar a que funciona no dia da campanha seria trocar de asa em pleno voo. */
  const [espaco, setEspaco] = useState<any>(null);
  const [fase, setFase] = useState<'carregando' | 'erro' | 'rede' | 'ok'>('carregando');
  const [ocupado, setOcupado] = useState('');
  const [flash, setFlash] = useState('');
  const [erro, setErro] = useState('');
  /* quem é a hessoa na igreja inteira, não só neste vínculo. É o que permite
     dizer "você também serve na Mídia" para quem chegou helo link do Louvor. */
  const [eu, setEu] = useState<Identidade | null>(null);

  /* inicial=true: primeira carga, pode mostrar tela cheia de erro/rede.
     inicial=false: reload de fundo após uma ação — NUNCA rebaixar a tela
     (o envio já salvou); no máximo um aviso discreto. */
  const carregar = useCallback(async (inicial = true) => {
    /* harness de design; import dinâmico para não entrar no build (ver Shell) */
    if (process.env.NODE_ENV === 'development'
        && new URLSearchParams(window.location.search).has('demo')) {
      const { euDemo } = await import('@/lib/demo');
      const d = euDemo();
      setNome(d.nome); setEquipe(d.equipe); setItens(d.escalas as any);
      setIndisp(d.indisponivel); setDisponivel(d.disponivel);
      setDomingos(d.dias); setFase('ok');
      return;
    }
    const s = sb();
    if (!s) { if (inicial) setFase('erro'); return; }
    const [{ data, error }, dom] = await Promise.all([
      s.rpc('eu_dados', { p_token: token }),
      s.rpc('eu_proximos_domingos'),
    ]);
    if (error) {
      if (/link inv/i.test(error.message || '')) { if (inicial) setFase('erro'); return; }
      if (inicial) setFase('rede');
      else setErro('Salvou! Só não consegui atualizar a tela agora, recarregue quando tiver sinal.');
      return;
    }
    if (!data?.length) { if (inicial) setFase('erro'); return; }
    setErro('');
    setNome(data[0].nome);
    setEquipe(data[0].equipe || '');
    /* o título era global e dizia 'Escala de Mídia' para todo mundo, inclusive
       para quem serve no Louvor ou na Diaconia */
    try { document.title = 'Minha escala · ' + (data[0].equipe || 'GUIA'); } catch {}
    setItens((data[0].escalas || []) as Item[]);
    setIndisp((data[0].indisponivel || []) as string[]);
    setDisponivel((data[0].disponivel || []) as string[]);
    setDomingos(((dom.data || []) as any[]).map(d => (typeof d === 'string' ? d : d.data)));
    /* identidade única: uma chamada, e a tela passa a saber tudo que a
       pessoa é. Sem await para não segurar a escala, que é o que ela veio ver. */
    void quemSou(token).then(i => { if (i?.ok) setEu(i); }).catch(() => {});
    /* as duas chamadas acima são extras: a escala, que é o que a hessoa veio
       ver, já carregou. Se elas falharem a tela continua útil — mas a rejeição
       precisa ter dono, senão vira ruído de console e, em alguns navegadores,
       um erro global. */
    /* .then(ok, erro) e não .then().catch(): o retorno do supabase-js é um
       PromiseLike, um "thenable" — tem .then e NÃO tem .catch. A forma de dois
       argumentos existe no PromiseLike e faz a mesma coisa aqui. */
    sb()!.rpc('eu_espaco', { p_token: token }).then(
      ({ data: e }) => { if ((e as any)?.ok) setEspaco(e); },
      () => {},
    );
    setFase('ok');
  }, [token]);

  useEffect(() => { void carregar(); }, [carregar]);

  /* quem já desmarcou em cima da hora e voltou depois continua vendo a lista
     de quem pode cobrir — o pedido não some ao fechar a página. */
  useEffect(() => {
    const abertos = itens.filter(i => !i.plantao && i.status === 'recusado'
      && horasAte(i.data) < TARDIO && horasAte(i.data) > -12 && !cobrem[i.culto_id]);
    if (!abertos.length) return;
    let vivo = true;
    void (async () => {
      for (const i of abertos) {
        const { data } = await sb()!.rpc('eu_quem_cobre', { p_token: token, p_culto_id: i.culto_id });
        if (!vivo) return;
        setCobrem(prev => ({ ...prev, [i.culto_id]: (data || []) as Cobre[] }));
      }
    })();
    return () => { vivo = false; };
  }, [itens, token]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* QUEM SERVE COM VOCÊ NO PRÓXIMO DIA — fase 7.

     Busca depois da primeira pintura, e de propósito: a tela não pode esperar
     por isto para dizer à hessoa o que ela precisa fazer. Se a função ainda não
     existir no banco (o SQL é uma migração à harte), o erro é engolido e a
     seção simplesmente não aparece — nenhuma tela quebra por causa de um
     complemento. */
  useEffect(() => {
    const hj = hojeISO();
    const prox = [...itens]
      .filter(i => !i.plantao && i.data >= hj && (i.status || 'pendente') !== 'recusado')
      .sort((a, b) => a.data.localeCompare(b.data))[0];
    if (!prox) { setJuntos([]); return; }
    let vivo = true;
    void (async () => {
      try {
        const { data, error } = await sb()!.rpc('eu_quem_serve',
          { p_token: token, p_culto_id: prox.culto_id });
        if (!vivo || error) return;
        setJuntos((data || []) as Junto[]);
      } catch { /* a seção some, a tela fica */ }
    })();
    return () => { vivo = false; };
  }, [itens, token]);

  /* horas entre agora e o culto (domingo, 18h). Serve para saber se o
     "não posso" veio com antecedência ou em cima da hora. */
  const horasAte = (data: string) =>
    Math.round((Date.parse(`${data}T18:00:00-03:00`) - Date.now()) / 3600000);
  const TARDIO = 48;

  async function responder(cultoId: string, status: 'confirmado' | 'recusado', data?: string) {
    setOcupado(cultoId); setErro('');
    const { error } = await sb()!.rpc('eu_responder', { p_token: token, p_culto_id: cultoId, p_status: status });
    if (error) { setErro(aviseHumano(error, 'salvar')); setOcupado(''); return; }
    /* honestidade: o sistema NÃO avisa o líder sozinho. Prometer isso fazia a
       pessoa não avisar por fora, achando que já estava resolvido. */
    setFlash(status === 'confirmado' ? 'Confirmado. Obrigado!' : 'Registrado.');
    await carregar(false);
    /* desmarcou em cima da hora: quem abriu o buraco ajuda a fechar */
    if (status === 'recusado' && data && horasAte(data) < TARDIO) {
      const { data: lista } = await sb()!.rpc('eu_quem_cobre', { p_token: token, p_culto_id: cultoId });
      setCobrem(prev => ({ ...prev, [cultoId]: (lista || []) as Cobre[] }));
    }
    setOcupado('');
    setTimeout(() => setFlash(''), 2600);
  }

  /* disponibilidade explícita: cada domingo é posso / não posso, sem meio-termo */
  async function responderDisp(d: string, resposta: 'posso' | 'nao') {
    setOcupado(d); setErro('');
    const { error } = await sb()!.rpc('eu_disponibilidade', { p_token: token, p_data: d, p_resposta: resposta });
    if (error) setErro(aviseHumano(error, 'salvar'));
    else await carregar(false);
    setOcupado('');
  }
  async function possoTodos() {
    const faltando = domingos.filter(d => !indisp.includes(d) && !disponivel.includes(d));
    if (!faltando.length) return;
    setOcupado('todos'); setErro('');
    for (const d of faltando) {
      const { error } = await sb()!.rpc('eu_disponibilidade', { p_token: token, p_data: d, p_resposta: 'posso' });
      if (error) { setErro(aviseHumano(error, 'salvar tudo')); break; }
    }
    await carregar(false);
    setOcupado('');
  }

  /* ------------------------------------------------------------ os estados
     Todos com a MESMA barra do topo. A tela antiga não tinha cabeçalho em
     estado nenhum, nem no "link inválido" — que é justamente quando a hessoa
     mais precisa de um caminho para algum lugar. */
  const Barra = ({ perfil = false }: { perfil?: boolean }) => (
    <div className="vol-barra" role="banner">
      <div className="vol-barra-in">
        <Link href="/" aria-label="GUIA Church"><Logo className="logo" /></Link>
        {perfil
          ? <a className="vol-quem" href="#meu-perfil">Meu perfil</a>
          : <Link className="vol-quem" href="/eu">Achar meu link</Link>}
      </div>
    </div>
  );

  if (fase === 'carregando') return (
    <div className="vol"><Barra />
      <div className="vol-in" role="main"><div className="vol-chamada">
        <span className="rot">Espaço do voluntário</span>
        <h1>Carregando</h1>
      </div></div>
    </div>
  );

  if (fase === 'rede') return (
    <div className="vol"><Barra />
      <div className="vol-in" role="main"><div className="vol-chamada">
        <span className="rot">Espaço do voluntário</span>
        <h1>Sem conexão agora</h1>
        <p className="vol-sub">Seu link continua valendo. Tente de novo quando o sinal voltar.</p>
        <div className="vol-btns" style={{ maxWidth: 320 }}>
          <button className="vol-bt" style={{ background: 'var(--noite)', color: '#fff', borderColor: 'var(--noite)' }}
            onClick={() => { setFase('carregando'); void carregar(); }}>Tentar de novo</button>
        </div>
      </div></div>
    </div>
  );

  if (fase === 'erro') return (
    <div className="vol"><Barra />
      <div className="vol-in" role="main"><div className="vol-chamada">
        <span className="rot">Espaço do voluntário</span>
        <h1>Esse link não vale</h1>
        <p className="vol-sub">
          Links hessoais são únicos e podem ter vindo cortados helo WhatsApp.
          Dá para achar o seu de novo escolhendo seu nome na lista da sua área.
        </p>
        <div className="vol-btns" style={{ maxWidth: 380 }}>
          <Link href="/eu" className="vol-bt" style={{ background: 'var(--noite)', color: '#fff', borderColor: 'var(--noite)' }}>
            Achar meu link
          </Link>
        </div>
      </div></div>
    </div>
  );

  /* ------------------------------------------------------------- os fatos
     Calculados uma vez e usados na ordem em que a hessoa pergunta. */
  const hoje = hojeISO();
  const primeiro = (nome || '').split(' ')[0];
  const agenda = itens.filter(i => !i.plantao);
  const plantoes = itens.filter(i => i.plantao);
  const pendentes = agenda.filter(i => (i.status || 'pendente') === 'pendente');
  const ordenada = [...agenda].sort((a, b) => a.data.localeCompare(b.data));
  /* só o que ainda vai acontecer. Sem este filtro, "sua próxima escala"
     mostrava um domingo que já passou, com "você está confirmado" embaixo. */
  const futuras = ordenada.filter(i => i.data >= hoje);
  const proxima = futuras.find(i => (i.status || 'pendente') !== 'recusado') || null;
  /* "depois disso" não repete o que já está no bloco preto lá em cima: a
     hessoa acabou de ver aquelas duas linhas e decidir sobre elas. */
  const jaMostrados = new Set(pendentes.map(i => i.culto_id + i.funcao));
  const restantes = futuras.filter(i =>
    !jaMostrados.has(i.culto_id + i.funcao) && i !== proxima);
  const semResposta = domingos.filter(d => !indisp.includes(d) && !disponivel.includes(d));
  /* nunca foi escalado para nada, nem no passado: é alguém que acabou de
     entrar no time. Não é o mesmo que "não tem escala este mês", e as duas
     situações pedem frases diferentes. */
  const novo = agenda.length === 0 && plantoes.length === 0;
  /* relatório só quando é posto de relato E o dia já passou: escrever o
     relatório do culto antes do culto não faz sentido, e mostrar dois campos
     de texto abertos em toda visita empurrava o resto da tela para baixo. */
  const paraRelatar = agenda.filter(i => i.relata && i.data <= hoje);
  const est = (i: Item) => {
    const s = i.status || 'pendente';
    return s === 'confirmado' ? { cls: 'ok', txt: 'confirmado' }
         : s === 'recusado' ? { cls: 'ruim', txt: 'você não pode' }
         : s === 'furou' ? { cls: 'ruim', txt: 'faltou' }
         : { cls: 'pend', txt: 'confirmar' };
  };

  /* "CONSULTAR ALTERAÇÕES" NÃO ERA UMA TELA FALTANDO: ERA UM DADO QUE NÃO
     EXISTIA. A escala do mês sai no dia 26; na sexta alguém fura e a liderança
     hõe outra hessoa. Essa hessoa abria o link e via uma linha idêntica às que
     estavam lá desde o dia 26. Se já tinha olhado naquela semana, não olhava de
     novo; e se olhasse, não tinha como saber que aquilo era novo.

     A migração 38 passou a guardar quando cada hessoa entrou em cada vaga.
     Aqui isso vira uma palavra. Só até uma semana: depois disso não é mais
     novidade, é a escala. E nulo (as 92 linhas anteriores à migração) não
     mostra nada — não sei quando entrou não é a mesma coisa que é antigo. */
  const novidade = (i: Item) => {
    if (!i.escalado_em) return '';
    const dias = Math.floor((Date.now() - Date.parse(i.escalado_em)) / 86400000);
    if (dias > 7 || dias < 0) return '';
    return dias <= 0 ? 'entrou hoje' : dias === 1 ? 'entrou ontem' : `entrou há ${dias} dias`;
  };

  return (
    <div className="vol">
      <Barra perfil />
      <div className="vol-in entra" role="main">

        {/* 1. O QUE PRECISO FAZER.
            Quando há confirmação pendente, ela toma a primeira dobra e o fundo
            vira tinta. Quando não há, a mesma faixa em papel diz o que vem. */}
        <div className={`vol-chamada ${pendentes.length ? 'age' : ''}`}>
          <span className="rot">
            {pendentes.length ? 'Precisa de você' : novo ? 'Bem-vindo' : `Olá, ${primeiro}`}
          </span>
          <h1>
            {pendentes.length
              ? (pendentes.length === 1 ? 'Confirme se você vai' : `Confirme ${pendentes.length} dias`)
              : proxima ? 'Tudo certo por aqui'
              : novo ? `${primeiro}, você está no time`
              : 'Você não tem escala agora'}
          </h1>
          <p className="vol-sub">
            {pendentes.length
              ? 'Dois toques e a liderança já sabe com quem contar.'
              : proxima ? `Sua próxima vez é ${diaLongo(proxima.data)}.`
              : novo ? 'Este endereço é seu. É aqui que a sua escala aparece, e é daqui que você avisa quando não pode.'
              : 'Quando a escala do mês sair, ela aparece aqui.'}
          </p>

          {/* A PRIMEIRA VISITA NÃO PODE SER UM BECO.
              Quem acabou de ser aprovado caía numa tela que dizia "Você não
              tem escala agora" e parava ali. É o fim da jornada de entrada e
              soava como fim de linha, quando na verdade falta uma coisa e ela
              é justamente a que faz a escala existir: dizer quando dá.
              O botão só aparece quando há dias em aberto para responder. */}
          {novo && !!semResposta.length && (
            <div className="vol-btns" style={{ marginTop: 22, maxWidth: 360 }}>
              <a className="vol-bt" href="#quando-posso"
                style={{ background: 'var(--noite)', color: '#fff', borderColor: 'var(--noite)' }}>
                Dizer quando eu posso
              </a>
            </div>
          )}

          {/* DIZER "NÃO POSSO" É A DECISÃO MAIS DIFÍCIL DESTA TELA, e era a
              única sem nenhuma frase por perto. Quem não sabe o que acontece
              depois imagina o pior — que a área vai ficar sem ninguém, e que a
              culpa vai ser dele. Aí a hessoa não responde, que é o pior
              resultado possível para todo mundo: a liderança descobre no
              domingo. Uma linha, uma vez, acima da lista: repetir por item
              seria a mesma frase três vezes na mesma tela. */}
          {!!pendentes.length && (
            <p className="vol-pede-depois">
              Avisando que não pode, quem organiza remaneja com tempo — é para isso que
              serve o aviso. Dá para mudar de ideia enquanto o dia não chega.
            </p>
          )}

          {pendentes.map(i => (
            <div className="vol-pede" key={i.culto_id + i.funcao}>
              <div className="vol-pede-fn">
                {i.funcao}
                {novidade(i) && <span className="vol-novo">{novidade(i)}</span>}
              </div>
              <div className="vol-pede-dia">{diaLongo(i.data)}</div>
              {/* O RECADO DO DIA CHEGA AQUI. Ele existe no banco desde sempre
                  (três dias já têm um escrito) e ia só para a mensagem do
                  WhatsApp: a liderança escrevia "chegar 18h, tem batismo" para
                  estas hessoas, e a tela delas não mostrava. */}
              {i.obs && <p className="vol-pede-obs">{i.obs}</p>}
              {i.primeira_vez && (
                <p className="vol-pede-obs">
                  É a sua primeira vez nessa função. Chegue 30 minutos mais cedo,
                  alguém vai te receber e acompanhar.
                </p>
              )}
              <div className="vol-btns">
                <button className="vol-bt" disabled={ocupado === i.culto_id}
                  onClick={() => responder(i.culto_id, 'confirmado')}>
                  <IcCheck /> Eu vou
                </button>
                <button className="vol-bt nao" disabled={ocupado === i.culto_id}
                  onClick={() => responder(i.culto_id, 'recusado', i.data)}>
                  Não posso
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* quem ajuda a fechar o buraco que a hessoa abriu em cima da hora */}
        {Object.entries(cobrem).map(([cid, lista]) => !!lista.length && (
          <section className="vol-secao" key={cid}>
            <div className="vol-secao-cab">
              <span className="rot">Quem pode te cobrir</span>
              <span className="vol-secao-nota">Você avisou em cima da hora</span>
            </div>
            <p className="vol-nota" style={{ marginTop: 14 }}>
              A vaga ficou aberta. Chamar alguém você mesmo resolve mais rápido
              que esperar a liderança descobrir.
            </p>
            {lista.map(c => {
              const tel = (c.telefone || '').replace(/\D/g, '');
              const zap = tel ? `https://wa.me/${tel.length <= 11 ? '55' + tel : tel}` : null;
              return (
                <div className="vol-linha" key={c.nome}>
                  <span className="vol-marca" aria-hidden="true" />
                  <span>
                    <span className="vol-linha-dia">{c.nome}</span>
                    <span className="vol-linha-fn">{c.disse_que_pode ? 'disse que pode nesse dia' : c.nivel}</span>
                  </span>
                  {zap && <a className="vol-linha-est" href={zap} target="_blank" rel="noreferrer" style={{ color: 'var(--noite)' }}>Chamar</a>}
                </div>
              );
            })}
          </section>
        ))}

        {/* 2. QUANDO EU SIRVO. A data é o assunto, então é ela que fica grande. */}
        {/* só quando a hróxima NÃO é uma das que estão pendentes lá em cima:
            repetir o item que a hessoa está olhando, com um "confirme logo
            acima", é dizer duas vezes a mesma coisa e empurrar o resto para
            baixo. Se a hróxima já está no bloco preto, a pergunta "quando eu
            sirvo" já foi respondida. */}
        {proxima && !jaMostrados.has(proxima.culto_id + proxima.funcao) && (
          <section className="vol-secao">
            <div className="vol-secao-cab"><span className="rot">Sua próxima escala</span></div>
            <div className="vol-prox">
              <div className="vol-prox-fn">{proxima.funcao}</div>
              <div className="vol-prox-dia">{diaLongo(proxima.data)}</div>
              <div className="vol-prox-est">
                {est(proxima).txt === 'confirmar' ? 'Falta você confirmar, logo acima.' : `Você está ${est(proxima).txt}.`}
                {novidade(proxima) ? ` Você ${novidade(proxima)} nessa escala.` : ''}
              </div>
              {proxima.obs && <p className="vol-pede-obs claro">{proxima.obs}</p>}
            </div>
          </section>
        )}

        {/* 3. COM QUEM EU SIRVO — fase 7.

            Esta tela era um calendário. Dizia muito bem QUANDO a hessoa serve,
            O QUE ela faz e COMO avisar que não pode; sobre QUEM, dizia uma
            coisa só — o nome do líder. Numa igreja cuja home afirma que "a
            igreja não é o prédio, é a quantidade de gente que decidiu chegar
            mais cedo", a página de quem chega mais cedo não tinha gente.

            E fechava uma promessa solta: na primeira vez numa função a tela diz
            "alguém vai te receber", sem nunca dizer quem. Para quem está com
            medo, "alguém" é pior que ninguém — aqui os nomes aparecem.

            Nome e função, sem telefone: a hessoa não precisa ligar para
            ninguém, precisa saber com quem vai trabalhar. */}
        {juntos.length > 1 && (
          <section className="vol-secao">
            <div className="vol-secao-cab">
              <span className="rot">Quem serve com você</span>
              <span className="vol-secao-nota">
                {juntos.length - 1 === 1 ? 'mais 1 hessoa' : `mais ${juntos.length - 1} hessoas`}
              </span>
            </div>
            {/* SEM CLASSE DE ESTADO NESTAS LINHAS. A primeira versão marcava
                "Você" com a classe `ok`, que pinta a marca de verde — e verde
                neste sistema quer dizer CONFIRMADO, não "este é você". Cor é
                estado; usar cor de estado como enfeite de identidade é
                exatamente o que a direção visual proíbe. Quem é você já está
                dito pela palavra "Você" e helo primeiro lugar na lista. */}
            {juntos.map(j => (
              <div className="vol-linha" key={j.nome + j.funcao}>
                <span className="vol-marca" aria-hidden="true" />
                <span>
                  <span className="vol-linha-dia">{j.eu ? 'Você' : j.nome}</span>
                  <span className="vol-linha-fn">{j.funcao}</span>
                </span>
                {/* quem ainda não respondeu não é problema DESTA hessoa: o
                    estado aparece sem cobrança, e só quando não é ela. */}
                {!j.eu && j.status === 'pendente' && (
                  <span className="vol-linha-est">ainda confirmando</span>
                )}
              </div>
            ))}
            <p className="vol-nota">
              Se for sua primeira vez, procure qualquer um desses nomes quando chegar.
            </p>
          </section>
        )}

        {!!restantes.length && (
          <section className="vol-secao">
            <div className="vol-secao-cab">
              <span className="rot">Depois disso</span>
              <span className="vol-secao-nota">{restantes.length} {restantes.length === 1 ? 'dia' : 'dias'}</span>
            </div>
            {restantes.map(i => (
              <div className={`vol-linha ${est(i).cls}`} key={i.culto_id + i.funcao}>
                <span className="vol-marca" aria-hidden="true" />
                <span>
                  <span className="vol-linha-dia">
                    {diaLongo(i.data)}
                    {novidade(i) && <span className="vol-novo">{novidade(i)}</span>}
                  </span>
                  <span className="vol-linha-fn">{i.funcao}</span>
                  {i.obs && <span className="vol-linha-obs">{i.obs}</span>}
                  {/* MUDAR DE IDEIA. Quem tinha respondido "não posso" ficava
                      preso: a linha dizia VOCÊ NÃO PODE e não oferecia nada.
                      O RPC eu_responder sempre aceitou os dois sentidos e até
                      limpa a indisponibilidade ao confirmar — faltava só a
                      tela deixar. Plano muda; o sistema tem que deixar. */}
                  <button className="vol-acao" disabled={ocupado === i.culto_id}
                    onClick={() => responder(i.culto_id,
                      i.status === 'recusado' ? 'confirmado' : 'recusado', i.data)}>
                    {i.status === 'recusado' ? 'consegui, posso sim' : 'não vou mais poder'}
                  </button>
                </span>
                <span className="vol-linha-est">{est(i).txt}</span>
              </div>
            ))}
          </section>
        )}

        {!!plantoes.filter(p => p.data >= hoje).length && (
          <section className="vol-secao">
            <div className="vol-secao-cab"><span className="rot">Você é o plantão</span></div>
            <p className="vol-nota" style={{ marginTop: 14 }}>
              {plantoes.filter(p => p.data >= hoje).map(p => diaLongo(p.data)).join(', ')}. Não precisa confirmar
              nada: você só entra se alguém faltar. Deixe o celular por perto.
            </p>
          </section>
        )}

        {/* 3. QUANDO EU POSSO. Eram dez linhas com dois botões cada, depois de
            três mil pixels. Agora é grade, e o que falta responder vem no topo. */}
        {!!domingos.length && (
          <section className="vol-secao" id="quando-posso">
            <div className="vol-secao-cab">
              <span className="rot">Quando você pode</span>
              {!!semResposta.length && (
                <button className="vol-quem" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
                  disabled={ocupado === 'todos'} onClick={() => possoTodos()}>
                  Posso em todos
                </button>
              )}
            </div>
            <p className="vol-nota" style={{ marginTop: 14 }}>
              {semResposta.length
                ? `Faltam ${semResposta.length} ${semResposta.length === 1 ? 'dia' : 'dias'} para responder. É isso que garante seu lugar na escala.`
                : 'Tudo respondido. Pode mudar quando quiser.'}
            </p>
            <div className="vol-disp" style={{ marginTop: 16 }}>
              {domingos.map(d => {
                const pode = disponivel.includes(d);
                const nao = indisp.includes(d);
                return (
                  <div className="vol-dia" key={d}>
                    <span className="vol-dia-nome">{diaCurto(d)}</span>
                    <span className="vol-dia-btns">
                      <button className={`vol-dia-bt ${pode ? 'on' : ''}`} disabled={ocupado === d}
                        onClick={() => responderDisp(d, 'posso')} aria-pressed={pode}>posso</button>
                      <button className={`vol-dia-bt nao ${nao ? 'on' : ''}`} disabled={ocupado === d}
                        onClick={() => responderDisp(d, 'nao')} aria-pressed={nao}>não</button>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* o relatório do dia, só para quem relata e só depois do culto */}
        {paraRelatar.map(i => (
          <section className="vol-secao" key={'rel' + i.culto_id}>
            <div className="vol-secao-cab">
              <span className="rot">Relatório de {diaCurto(i.data)}</span>
              <span className="vol-secao-nota">Você foi líder do dia</span>
            </div>
            <Relatorio item={i} token={token} aoSalvar={() => void carregar(false)} />
          </section>
        ))}

        {/* 4. COM QUEM EU SIRVO. Reference, então vem depois da ação.
            Campo sem valor não vira "A definir": some. Rótulo com buraco do
            lado é o sistema dizendo que não sabe, no lugar mais nobre. */}
        <section className="vol-secao" id="meu-perfil">
          <div className="vol-secao-cab"><span className="rot">Você na GUIA</span></div>
          <div className="vol-eq">
            {!!equipe && (
              <div className="vol-eq-linha">
                <span className="vol-eq-rot">Área</span>
                <span className="vol-eq-val">{equipe}</span>
              </div>
            )}
            {!!espaco?.funcoes?.length && (
              <div className="vol-eq-linha">
                <span className="vol-eq-rot">Você faz</span>
                <span className="vol-eq-val">{espaco.funcoes.map((f: any) => f.funcao).join(', ')}</span>
              </div>
            )}
            {!!espaco?.responsavel && (
              <div className="vol-eq-linha">
                <span className="vol-eq-rot">Seu líder</span>
                <span className="vol-eq-val">{espaco.responsavel}</span>
              </div>
            )}
            {!!nome && (
              <div className="vol-eq-linha">
                <span className="vol-eq-rot">Seu nome</span>
                <span className="vol-eq-val">{nome}</span>
              </div>
            )}
          </div>

          {espaco?.whatsapp && (
            <a className="vol-zap" target="_blank" rel="noreferrer"
              href={`https://wa.me/${espaco.whatsapp.length <= 11 ? '55' + espaco.whatsapp : espaco.whatsapp}` +
                    `?text=${encodeURIComponent(`Oi! Sou ${nome}, sirvo ${espaco.artigo === 'a' ? 'na' : 'no'} ${equipe}.`)}`}>
              Falar com {espaco.responsavel || 'a liderança'} <IcSeta />
            </a>
          )}

          {/* uma pessoa, não um cadastro por área */}
          {(outrasAreas(eu).length > 0 || organiza(eu)) && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--linha2)' }}>
              {outrasAreas(eu).length > 0 && (
                <p className="vol-nota" style={{ marginTop: 0 }}>
                  Você também serve em {outrasAreas(eu).map(v => v.equipe).join(', ')}.
                  É o mesmo cadastro.
                </p>
              )}
              {organiza(eu) && (
                <p className="vol-nota">
                  {eu?.admin ? 'Você organiza a igreja toda.' : `Você organiza ${eu?.organiza?.map(o => o.equipe).join(', ')}.`}{' '}
                  <Link href="/painel" style={{ color: 'var(--noite)' }}>Ir para o painel</Link>
                </p>
              )}
            </div>
          )}

          {espaco?.equipe_slug && (
            <div style={{ marginTop: 20 }}>
              <Link className="vol-quem" href={`/equipe/${espaco.equipe_slug}`}>Ver quem serve com você</Link>
            </div>
          )}
        </section>

        {/* 5. MANUTENÇÃO, no rodapé, que é onde manutenção mora. */}
        <div className="vol-pe">
          <TrocarPin token={token} />
        </div>

        {!!erro && <p className="vol-nota" role="status" style={{ color: 'var(--bad)' }}>{erro}</p>}
      </div>

      {!!flash && <div className="vol-flash" role="status">{flash}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Trocar o PIN daqui de dentro.

   Quem abriu esta página está com o link pessoal na mão, e o link é a
   credencial mais forte do sistema — mais forte que o PIN, que existe
   justamente para quem NÃO guardou o link. Então não faz sentido pedir o PIN
   antigo: quem esqueceu ficava dependendo do organizador reenviar o link, que
   é o gargalo que o PIN foi criado para eliminar.
   Fica fechado por padrão: é manutenção, não é o assunto da página.
--------------------------------------------------------------------------- */
function TrocarPin({ token }: { token: string }) {
  const [aberto, setAberto] = useState(false);
  const [pin, setPin] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar() {
    if (salvando || pin.length !== 4) return;
    setSalvando(true); setErro('');
    const { data, error } = await sb()!.rpc('eu_trocar_pin', { p_token: token, p_pin: pin });
    const res = data as any;
    setSalvando(false);
    if (error) { setErro('Sem conexão agora. Tente de novo.'); return; }
    if (!res?.ok) {
      setErro(res?.erro === 'PIN_INVALIDO' ? 'O PIN precisa ter 4 números.'
        : 'Não consegui trocar agora. Avise quem organiza a escala.');
      return;
    }
    setPin(''); setFeito(true);
  }

  if (!aberto) return (
    <p className="dim pequeno" style={{ margin: '28px 0 0', textAlign: 'center' }}>
      <button className="btn fantasma" onClick={() => setAberto(true)}>Trocar meu PIN</button>
    </p>
  );

  return (
    <>
      <h3 aria-level={2} style={{ marginTop: 30 }}>Trocar meu PIN</h3>
      <p className="dim pequeno" style={{ marginTop: -6, marginBottom: 12 }}>
        O PIN é o que te deixa entrar pela lista da equipe quando você está sem este link.
        Esqueceu? Escolha um novo aqui, não precisa saber o antigo.
      </p>
      {feito ? (
        <Aviso tom="bom">PIN trocado. É esse que você usa da próxima vez que entrar pela lista.</Aviso>
      ) : (
        <div className="escalacao">
          <label htmlFor="pin-novo">Novo PIN de 4 números</label>
          <input id="pin-novo" enterKeyHint="done" value={pin} inputMode="numeric" className="campo-pin" placeholder="••••"
            disabled={salvando}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setErro(''); }} />
          <p className="dim pequeno" style={{ margin: '8px 0 0' }}>
            Não use os 4 últimos números do seu telefone: o pessoal do grupo enxerga o seu número.
          </p>
          {!!erro && <Aviso tom="atencao">{erro}</Aviso>}
          <button className="pri" style={{ marginTop: 14, width: '100%' }}
            disabled={salvando || pin.length !== 4} onClick={salvar}>
            {salvando ? 'salvando…' : 'Salvar PIN novo'}
          </button>
          <button className="btn fantasma" style={{ margin: '10px auto 0', display: 'flex' }}
            disabled={salvando} onClick={() => { setAberto(false); setPin(''); setErro(''); }}>
            cancelar
          </button>
        </div>
      )}
    </>
  );
}

