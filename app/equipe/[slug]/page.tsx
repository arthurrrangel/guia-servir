'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { sbPublico as sb } from '@/lib/supabase';
import { Aviso } from '@/components/Ui';
import { IcBusca, IcSeta } from '@/components/Icones';

/* ATENÇÃO — como a identificação funciona aqui (não simplificar de volta).
   A entrada antiga era: escolher o nome numa lista + digitar os 4 últimos
   dígitos do WhatsApp. Num grupo de WhatsApp o número de todos é visível, então
   esses dígitos não são segredo: qualquer um do grupo entrava no lugar de outro.
   Agora os dígitos servem UMA vez só, para a pessoa criar um PIN próprio. Da
   segunda vez em diante o PIN é a credencial, e ele é segredo de verdade.
   O PIN nunca é guardado em texto: vai como sha256(pin + token) na coluna
   pin_hash, e o banco trava depois de 8 tentativas erradas no dia. */

const K_TOKEN = 'escala.meu-token';

type Pessoa = { voluntario_id: string; primeiro_nome: string; tem_pin: boolean; tem_tel: boolean };
type Linha = Pessoa & { area: string; ordem: number; nivel: string };

/* buscar por "jo" tem que achar "João": tira acento e caixa dos dois lados */
const normal = (t: string) =>
  (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

type Nivel = 'titular' | 'reserva' | 'treino';
/* O primeiro toque é RESERVA de propósito.
   Antes o ciclo começava em titular, e "titular" quer dizer "eu seguro essa
   área sozinho". O gesto mais barato (um toque) produzia a afirmação mais
   forte: de 16 cadastros, 15 saíram titulares e uma pessoa só usou reserva.
   Ninguém mentiu, a interface é que perguntou errado. Agora quem quer dizer
   "faço sozinho" precisa tocar duas vezes, que é um ato deliberado. */
/* rótulo curto para o controle de três opções dentro da linha */
const CURTO: Record<Nivel, string> = {
  titular: 'sozinho', reserva: 'ajudo', treino: 'aprendo',
};
const OPCOES: Nivel[] = ['reserva', 'titular', 'treino'];
type Posto = { nome: string; tipos: string[]; descricao?: string; familia?: string };

/* Postos numerados viram família + sufixo: ESTACIONAMENTO 1/2/3 é UM bloco com
   três posições, não três linhas repetindo a mesma palavra. No ministério de
   mídia, onde cada área tem nome próprio, cada família tem um item só e o
   bloco some sozinho. */
const familia = (nome: string) => {
  const p = nome.trim().split(/\s+/);
  const fim = p[p.length - 1];
  return p.length > 1 && fim.length <= 2 ? p.slice(0, -1).join(' ') : nome;
};
const sufixo = (nome: string) => {
  const p = nome.trim().split(/\s+/);
  const fim = p[p.length - 1];
  return p.length > 1 && fim.length <= 2 ? fim : '';
};

export default function EntradaEquipe() {
  const { slug } = useParams<{ slug: string }>();
  const [equipe, setEquipe] = useState('');
  const [areas, setAreas] = useState<{ area: string; gente: Pessoa[] }[]>([]);
  const [fase, setFase] = useState<'carregando' | 'erro' | 'rede' | 'inicio' | 'pin' | 'criar' | 'cadastro' | 'enviado'>('carregando');
  /* primeiro nome de quem acabou de se cadastrar num ministério com portão.
     Guardado à parte porque a pessoa não vira `alvo`: ela ainda não tem página. */
  const [enviadoPor, setEnviadoPor] = useState('');
  const [alvo, setAlvo] = useState<Pessoa | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [tokenSalvo, setTokenSalvo] = useState('');

  const [pin, setPin] = useState('');
  const [dig, setDig] = useState('');
  const [pinNovo, setPinNovo] = useState('');
  const refPin = useRef<HTMLInputElement>(null);
  /* trava de reentrância do auto-envio: ref e não estado, porque precisa
     valer no mesmo tick, antes de qualquer re-render */
  const enviando = useRef(false);

  /* nome + em que cultos a área existe: HEAD e transmissão só têm domingo,
     e quem escolhe precisa saber disso na hora de escolher. */
  const [nomesArea, setNomesArea] = useState<Posto[]>([]);
  /* ministério que só aloca quem já sabe a função não pergunta nível: marcar
     o posto é uma coisa só, "eu faço". */
  const [semNiveis, setSemNiveis] = useState(false);
  const [avisoCadastro, setAvisoCadastro] = useState('');

  /* Quem serve em várias áreas aparece uma vez em cada, então a lista fica
     longa de propósito (é assim que o líder pediu). A busca é o que resolve:
     em vez de rolar 7 seções, a pessoa digita 3 letras e acha o próprio nome. */
  const [busca, setBusca] = useState('');
  const [fNome, setFNome] = useState('');
  const [fTel, setFTel] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fNiveis, setFNiveis] = useState<Record<string, Nivel>>({});
  /* postos agrupados por família, na ordem em que o ministério definiu */
  const grupos = (() => {
    const m = new Map<string, Posto[]>();
    for (const a of nomesArea) {
      const f = familia(a.nome);
      if (!m.has(f)) m.set(f, []);
      m.get(f)!.push(a);
    }
    return [...m.entries()];
  })();
  /* "só domingo" só informa alguma coisa quando o ministério TEM os dois tipos.
     No Serviço do Culto todos os 12 postos são de domingo, e repetir o aviso
     doze vezes dobrava a largura de cada linha sem distinguir nada. */
  const misturado = nomesArea.some(a => a.tipos.includes('follow'))
    && nomesArea.some(a => !a.tipos.includes('follow'));
  const marcadas = Object.keys(fNiveis).length;

  useEffect(() => { try { setTokenSalvo(localStorage.getItem(K_TOKEN) || ''); } catch {} }, []);

  const ehDemo = () => process.env.NODE_ENV === 'development' && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('demo');

  const carregar = useCallback(async () => {
    /* no harness o carregamento real tem que ser cortado AQUI. Na primeira
       tentativa eu só setei a fase num useEffect e o carregar(), que é async,
       chegava depois e sobrescrevia com 'rede'. A auditoria passou verde numa
       tela em branco. */
    if (ehDemo()) return;
    const s = sb(); if (!s) { setFase('rede'); return; }
    const [eq, time] = await Promise.all([
      s.rpc('equipe_publica', { p_slug: slug }),
      s.rpc('equipe_time', { p_slug: slug }),
    ]);
    /* erro de rede não é link inválido: quem abre no metrô não pode concluir
       que foi tirado da equipe */
    if (eq.error) { setFase(/n(a|ã)o encontr|inv(a|á)lid/i.test(eq.error.message || '') ? 'erro' : 'rede'); return; }
    const linhas = (eq.data || []) as any[];
    if (!linhas.length) { setFase('erro'); return; }
    setEquipe(linhas[0].equipe || '');
    /* a aba do navegador dizia 'Escala de Mídia' em TODOS os ministérios,
       porque o título era global. É o que a pessoa vê no WhatsApp antes mesmo
       de abrir o link. */
    try { document.title = 'Servir · ' + (linhas[0].equipe || 'GUIA'); } catch {}
    setSemNiveis(!!linhas[0].sem_niveis);
    setAvisoCadastro(linhas[0].aviso_cadastro || '');

    /* uma seção por área, na ordem da escala. A mesma pessoa aparece em cada
       área que ela marcou no cadastro — é assim que ela se acha. */
    const porArea = new Map<string, Pessoa[]>();
    for (const l of ((time.data || []) as Linha[])) {
      const arr = porArea.get(l.area) || [];
      arr.push({ voluntario_id: l.voluntario_id, primeiro_nome: l.primeiro_nome, tem_pin: l.tem_pin, tem_tel: l.tem_tel });
      porArea.set(l.area, arr);
    }
    setAreas([...porArea.entries()].map(([area, gente]) => ({ area, gente })));
    setFase('inicio');
  }, [slug]);

  useEffect(() => { void carregar(); }, [carregar]);

  /* Quem chega pela porta pública já disse "quero entrar": mostrar primeiro a
     lista de quem JÁ está no time faz a pessoa procurar o próprio nome numa
     lista onde ele não pode estar. ?novo=1 pula direto para o cadastro. */
  const [pulouParaCadastro, setPulou] = useState(false);
  useEffect(() => {
    if (pulouParaCadastro || fase !== 'inicio') return;
    if (new URLSearchParams(window.location.search).get('novo') !== '1') return;
    setPulou(true); void abrirCadastro();
  }, [fase, pulouParaCadastro, abrirCadastro]);

  /* Harness: o Chromium do container não alcança o Supabase, então sem isto a
     tela de cadastro nunca renderizava na auditoria e eu revisaria de olho
     fechado justamente a tela que o time inteiro abre. Só em desenvolvimento. */
  useEffect(() => {
    if (!ehDemo()) return;
    /* o fixture segue o slug da URL: os dois ministérios têm formatos de nome
       bem diferentes (nome próprio x posto numerado, um tipo de culto x dois),
       e revisar só um deles é revisar metade da tela. */
    const servico = slug === 'servico';
    setEquipe(servico ? 'Serviço do Culto' : 'Mídia');
    setNomesArea(servico
      ? [
        'LÍDER 1', 'LÍDER 2', 'ESTACIONAMENTO 1', 'ESTACIONAMENTO 2', 'ESTACIONAMENTO 3',
        'RECEPÇÃO 1', 'RECEPÇÃO 2', 'GABINETE, COZINHA E BANHEIROS',
        'SETOR A', 'SETOR B', 'SETOR C', 'SETOR D',
      ].map(nome => {
        const fam = nome.startsWith('LÍDER') ? 'Os dois lideram juntos. Chegam antes das 9h, reúnem o grupo para orar, cuidam do púlpito e da água do pastor, contam o ofertório com o pastor e são os últimos a sair. No fim, preenchem o relatório do dia.'
          : nome.startsWith('ESTACIONAMENTO') ? 'Chegam às 8h30 para organizar os cones. Orientam quem estaciona para não bloquear a saída dos vizinhos e ficam no estacionamento o culto inteiro: se um precisa sair, o outro permanece.'
          : nome.startsWith('RECEPÇÃO') ? 'Chegam antes das 9h e recebem com alegria. Identificam o visitante, anotam nome e telefone e mostram onde é banheiro, bebedouro e sala Kids.'
          : nome.startsWith('SETOR') ? 'Cada um cuida de um quarto do templo. Recebe os irmãos, orienta a ocupação da frente para trás, ajuda no dízimo e recolhe os cálices da ceia.'
          : '';
        const posto = nome.startsWith('SETOR')
          ? ({ 'SETOR A': 'frente, lado esquerdo de quem entra', 'SETOR B': 'frente, lado direito de quem entra',
               'SETOR C': 'fundos, lado esquerdo de quem entra', 'SETOR D': 'fundos, lado direito de quem entra' } as any)[nome]
          : nome.startsWith('GABINETE') ? 'É um casal. Prepara o café dos pastores, confere os banheiros, cada um o do seu sexo, e troca o galão do bebedouro.'
          : '';
        return { nome, tipos: ['domingo'], descricao: posto, familia: fam };
      })
      : [
        { nome: 'PROJEÇÃO', tipos: ['domingo', 'follow'] },
        { nome: 'ILUMINAÇÃO', tipos: ['domingo', 'follow'] },
        { nome: 'EDIÇÃO', tipos: ['domingo', 'follow'] },
        { nome: 'FOTO', tipos: ['domingo', 'follow'] },
        { nome: 'FILMAGEM', tipos: ['domingo', 'follow'] },
        { nome: 'HEAD', tipos: ['domingo'] },
        { nome: 'TRANSMISSÃO (CORTE + PTZ)', tipos: ['domingo'] },
        { nome: 'CÂMERA 1', tipos: ['domingo'] },
        { nome: 'CÂMERA 2', tipos: ['domingo'] },
      ]);
    setSemNiveis(servico);
    setAvisoCadastro(servico
      ? 'Estes postos são para quem já sabe a função. Se você quer se voluntariar e aprender, chama no (21) 99594-6491 que a liderança te encaixa.'
      : '');
    setFNiveis(servico ? { 'ESTACIONAMENTO 2': 'titular' } : { 'FOTO': 'reserva' });
    setFase('cadastro');
  }, [slug]);

  function textoDoErro(codigo: string, restam?: number) {
    if (codigo === 'DIGITOS_NAO_CONFEREM')
      return `Esses 4 dígitos não batem com o WhatsApp cadastrado.${restam ? ` Restam ${restam} tentativa${restam > 1 ? 's' : ''}.` : ''}`;
    if (codigo === 'PIN_NAO_CONFERE')
      return `PIN errado.${restam ? ` Restam ${restam} tentativa${restam > 1 ? 's' : ''}.` : ''}`;
    if (codigo === 'MUITAS_TENTATIVAS')
      return 'Muitas tentativas erradas hoje. Peça seu link pessoal a quem organiza a escala.';
    if (codigo === 'SEM_TELEFONE')
      return 'Seu WhatsApp ainda não está cadastrado. Peça o link pessoal a quem organiza a escala.';
    if (codigo === 'PIN_INVALIDO') return 'O PIN precisa ter 4 números.';
    if (codigo === 'JA_TEM_PIN') return 'Você já criou seu PIN. Entre com ele.';
    if (codigo === 'SEM_PIN') return 'Você ainda não criou seu PIN.';
    if (codigo === 'NOME_INCOMPLETO') return 'Escreva seu nome e sobrenome.';
    if (codigo === 'TELEFONE_INVALIDO') return 'Confira o WhatsApp, com DDD, só números.';
    if (codigo === 'SEM_AREA') return 'Marque pelo menos uma área que você faz ou quer aprender.';
    if (codigo === 'EMAIL_INVALIDO') return 'Confira o e-mail, ou deixe em branco.';
    if (codigo === 'JA_CADASTRADO')
      return 'Esse WhatsApp já está cadastrado. Ache seu nome na lista e entre por ele.';
    if (codigo === 'MUITOS_CADASTROS') return 'Muitos cadastros agora. Tente de novo daqui a pouco.';
    return 'Não consegui entrar. Fale com quem organiza a escala do ministério.';
  }

  function escolher(p: Pessoa) {
    if (ocupado) return;
    setAlvo(p); setErro(''); setPin(''); setDig(''); setPinNovo('');
    setFase(p.tem_pin ? 'pin' : 'criar');
    setTimeout(() => refPin.current?.focus(), 60);
  }

  function entrou(token: string) {
    try { localStorage.setItem(K_TOKEN, token); } catch {}
    location.href = `/eu/${token}`;
  }

  /* `valor` existe porque o auto-envio do 4º dígito chama esta função de
     dentro de um setTimeout: o closure daquele render ainda enxerga o `pin`
     ANTERIOR (3 dígitos), então a checagem de tamanho reprovava e o campo
     ficava parado — a pessoa digitava os 4 números e não acontecia nada.
     `enviando` é ref, não estado: dois onChange seguidos agendariam dois
     envios, e cada envio errado queima uma das 8 tentativas do dia. */
  async function entrarComPin(valor?: string) {
    const p = valor ?? pin;
    if (enviando.current || ocupado || p.length !== 4 || !alvo) return;
    enviando.current = true;
    setOcupado(true); setErro('');
    const { data, error } = await sb()!.rpc('equipe_pin_entrar',
      { p_slug: slug, p_voluntario: alvo.voluntario_id, p_pin: p });
    const res = data as any;
    if (error || !res?.ok) {
      setErro(error ? 'Sem conexão agora. Tente de novo.' : textoDoErro(res?.erro || '', res?.restam));
      setPin(''); setOcupado(false); enviando.current = false;
      setTimeout(() => refPin.current?.focus(), 40); return;
    }
    entrou(res.token);
  }

  async function criarPin() {
    if (ocupado || dig.length !== 4 || pinNovo.length !== 4 || !alvo) return;
    setOcupado(true); setErro('');
    const { data, error } = await sb()!.rpc('equipe_pin_criar',
      { p_slug: slug, p_voluntario: alvo.voluntario_id, p_ult4: dig, p_pin: pinNovo });
    const res = data as any;
    if (error || !res?.ok) {
      setErro(error ? 'Sem conexão agora. Tente de novo.' : textoDoErro(res?.erro || '', res?.restam));
      setOcupado(false); return;
    }
    entrou(res.token);
  }

  async function abrirCadastro() {
    setErro(''); setFase('cadastro');
    const { data } = await sb()!.rpc('equipe_funcoes', { p_slug: slug });
    setNomesArea(((data || []) as any[]).map(f => ({
      nome: f.nome,
      tipos: Array.isArray(f.tipos) && f.tipos.length ? f.tipos : ['domingo', 'follow'],
      descricao: f.descricao || '',
      familia: f.descricao_familia || '',
    })));
  }

  /* Era um chip que ciclava a cada toque: null > ajudo > sozinho > aprendo.
     Funcionava, mas o nível só existia dentro da cabeça de quem tocou, e para
     descer de "sozinho" para "ajudo" a pessoa tinha que dar a volta inteira.
     Agora o posto é uma escolha (entro / não entro) e o nível é um controle
     visível. O primeiro toque continua caindo em "ajudo" de propósito: quem
     quer dizer "faço sozinho" precisa afirmar isso. */
  function marcarArea(nome: string, nivel: Nivel | null) {
    const c = { ...fNiveis };
    if (nivel) c[nome] = nivel; else delete c[nome];
    setFNiveis(c);
  }

  async function inscrever() {
    if (ocupado) return;
    setOcupado(true); setErro('');
    const { data, error } = await sb()!.rpc('inscrever', {
      p_slug: slug, p_nome: fNome, p_tel: fTel, p_email: fEmail, p_funcoes: fNiveis,
    });
    const res = data as any;
    if (error || !res?.ok) {
      setErro(error ? 'Sem conexão agora. Tente de novo.' : textoDoErro(res?.erro || ''));
      setOcupado(false); return;
    }
    /* Ministério com pré-requisito (hoje: Louvor) devolve `pendente` e NÃO
       devolve token — a pessoa está cadastrada, mas ainda não está no time.
       Mandar ela para /eu/<token> aqui seria mentir sobre o próprio estado. */
    if (res.pendente) {
      setEnviadoPor((res.nome || '').split(' ')[0] || '');
      setOcupado(false); setFase('enviado'); window.scrollTo(0, 0); return;
    }
    if (!res.token) {
      setErro(textoDoErro('')); setOcupado(false); return;
    }
    entrou(res.token);
  }

  const so4 = (v: string) => v.replace(/\D/g, '').slice(0, 4);

  if (fase === 'carregando') return (
    <div className="eu-fundo"><div className="eu-topo"><div className="eu-topo-in">
      <span className="overline">Escala</span><div className="eu-titulo">carregando…</div>
    </div></div></div>
  );
  if (fase === 'rede') return (
    <div className="eu-fundo"><div className="eu-topo"><div className="eu-topo-in">
      <span className="overline">Escala</span><div className="eu-titulo">Sem conexão</div>
      <p className="eu-sub">Não consegui carregar agora. O link continua valendo, tente de novo.</p>
      <button className="claro" style={{ marginTop: 14 }} onClick={() => { setFase('carregando'); void carregar(); }}>
        Tentar de novo
      </button>
    </div></div></div>
  );
  if (fase === 'erro') return (
    <div className="eu-fundo"><div className="eu-topo"><div className="eu-topo-in">
      <span className="overline">Escala</span><div className="eu-titulo">Link inválido</div>
      <p className="eu-sub">Peça o link certo para quem organiza a escala do ministério.</p>
    </div></div></div>
  );

  const titulo = fase === 'pin' ? `Oi, ${alvo?.primeiro_nome}`
    : fase === 'criar' ? `É você, ${alvo?.primeiro_nome}?`
    : fase === 'cadastro' ? 'Entrar no time'
    : fase === 'enviado' ? (enviadoPor ? `Recebido, ${enviadoPor}` : 'Recebido')
    : 'Quem é você?';
  const sub = fase === 'pin' ? 'Digite seu PIN de 4 números para abrir sua página.'
    : fase === 'criar' ? 'Primeira vez aqui. Confirme que é você e crie um PIN só seu.'
    : fase === 'cadastro' ? 'Leva menos de um minuto. Depois você recebe a escala e responde por aqui.'
    : fase === 'enviado' ? `Seu cadastro chegou para a liderança do ${equipe}.`
    : 'Ache seu nome na sua área e toque nele.';

  return (
    <div className="eu-fundo">
      <div className="eu-topo"><div className="eu-topo-in">
        <span className="overline">{equipe}</span>
        <div className="eu-titulo">{titulo}</div>
        <p className="eu-sub">{sub}</p>
      </div></div>

      <div className="eu">
        {erro && <Aviso tom="erro">{erro}</Aviso>}

        {/* Ministério com pré-requisito. A pessoa terminou o cadastro e a única
            pergunta que importa para ela agora é "e agora?". A tela responde
            isso e nada mais — sem status, sem porcentagem, sem "em análise",
            que soam a nota de avaliação para quem se ofereceu para servir. */}
        {fase === 'enviado' && (
          <div className="escalacao">
            <Aviso tom="bom">
              Cadastro enviado. Você não precisa fazer mais nada agora.
            </Aviso>

            <p style={{ marginTop: 16 }}>O que acontece daqui pra frente:</p>
            <ol style={{ margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.65 }}>
              <li>A liderança do {equipe} recebe o seu nome e o que você marcou.</li>
              <li>Alguém fala com você no WhatsApp para conversar e confirmar.</li>
              <li>Depois disso você recebe seu link, cria um PIN de 4 números e
                  passa a ver a sua escala por aqui.</li>
            </ol>

            <p className="dim pequeno" style={{ marginTop: 16 }}>
              Se você ainda não está no grupo do {equipe} no WhatsApp, peça o convite, 
              é por lá que a conversa começa.
            </p>

            <button className="claro" style={{ marginTop: 18, width: '100%' }}
              onClick={() => { setFase('inicio'); setErro(''); setEnviadoPor(''); }}>
              Voltar para o começo
            </button>
          </div>
        )}

        {fase === 'inicio' && (
          <>
            {!!tokenSalvo && (
              <div className="linha" style={{ marginBottom: 14, gap: 8 }}>
                <a className="btn claro cresce" href={`/eu/${tokenSalvo}`}>Já entrei neste aparelho, abrir minha página</a>
                <button className="mini fantasma" onClick={() => { try { localStorage.removeItem(K_TOKEN); } catch {} setTokenSalvo(''); }}>
                  não sou eu
                </button>
              </div>
            )}

            {areas.length > 6 && (
              <div className="busca-nome">
                <IcBusca />
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="digite seu nome" aria-label="Buscar seu nome"
                  autoComplete="off" enterKeyHint="search" />
                {!!busca && <button className="mini fantasma" onClick={() => setBusca('')}>limpar</button>}
              </div>
            )}

            {!areas.length
              ? <div className="escalacao centro" style={{ padding: '30px 22px' }}>
                  <div className="forte" style={{ fontSize: 'var(--t-corpo)' }}>Ninguém cadastrado ainda</div>
                  <p className="dim pequeno" style={{ margin: '6px 0 12px' }}>Seja o primeiro do time.</p>
                  <button className="pri" onClick={abrirCadastro}>Quero entrar no time</button>
                </div>
              : areas
                .map(({ area, gente }) => ({
                  area,
                  gente: busca.trim()
                    ? gente.filter(p => normal(p.primeiro_nome).includes(normal(busca)))
                    : gente,
                }))
                .filter(a => a.gente.length)
                .map(({ area, gente }) => (
                  <div className="area-bloco" key={area}>
                    <h3 className="area-titulo">{area} <span className="area-n">{gente.length}</span></h3>
                    {gente.map(p => (
                      <button key={area + p.voluntario_id} className="pick-nome" disabled={ocupado}
                        onClick={() => escolher(p)}>
                        <span className="cresce">{p.primeiro_nome}</span>
                        {!p.tem_pin && <span className="pill">criar PIN</span>}
                        <IcSeta />
                      </button>
                    ))}
                  </div>
                ))}

            {!!areas.length && (
              <div className="escalacao centro" style={{ marginTop: 16, padding: '18px 22px' }}>
                <div className="forte">Não achou seu nome?</div>
                <p className="dim pequeno" style={{ margin: '4px 0 12px' }}>
                  Se você ainda não faz parte do time, cadastre-se aqui mesmo.
                </p>
                <button className="pri" onClick={abrirCadastro}>Quero entrar no time</button>
              </div>
            )}
          </>
        )}

        {fase === 'pin' && (
          <div className="escalacao">
            <label>Seu PIN</label>
            <input enterKeyHint="done" ref={refPin} value={pin} inputMode="numeric" autoComplete="one-time-code"
              className="campo-pin" placeholder="••••" disabled={ocupado}
              onChange={e => { const v = so4(e.target.value); setPin(v); if (v.length === 4) setTimeout(() => entrarComPin(v), 10); }} />
            <button className="pri" style={{ marginTop: 14, width: '100%' }}
              disabled={ocupado || pin.length !== 4} onClick={() => entrarComPin()}>
              {ocupado ? 'entrando…' : 'Entrar'}
            </button>
            <p className="dim pequeno" style={{ margin: '12px 0 0' }}>
              Esqueceu o PIN? Se você salvou seu link pessoal, entre por ele e troque o PIN lá dentro.
              Se não tiver o link, peça no privado a quem organiza a escala.
            </p>
            <button className="btn fantasma" style={{ margin: '10px auto 0', display: 'flex' }}
              disabled={ocupado} onClick={() => { setFase('inicio'); setAlvo(null); setErro(''); }}>
              não sou eu, voltar
            </button>
          </div>
        )}

        {fase === 'criar' && (
          <div className="escalacao">
            {!alvo?.tem_tel && (
              <Aviso tom="atencao">
                Seu WhatsApp ainda não está cadastrado, então não dá para confirmar que é você por aqui.
                Peça o link pessoal no privado a quem organiza a escala.
              </Aviso>
            )}
            <label>Os 4 últimos números do seu WhatsApp</label>
            <input enterKeyHint="done" value={dig} inputMode="numeric" className="campo-pin" placeholder="••••"
              disabled={ocupado || !alvo?.tem_tel} onChange={e => setDig(so4(e.target.value))} />

            <label style={{ marginTop: 16, display: 'block' }}>Agora crie um PIN de 4 números</label>
            <input enterKeyHint="done" value={pinNovo} inputMode="numeric" className="campo-pin" placeholder="••••"
              disabled={ocupado || !alvo?.tem_tel} onChange={e => setPinNovo(so4(e.target.value))} />
            <p className="dim pequeno" style={{ margin: '8px 0 0' }}>
              É esse PIN que você vai usar daqui pra frente. Não use os mesmos 4 números do telefone,
              porque o pessoal do grupo enxerga o seu número.
            </p>

            <button className="pri" style={{ marginTop: 16, width: '100%' }}
              disabled={ocupado || dig.length !== 4 || pinNovo.length !== 4} onClick={criarPin}>
              {ocupado ? 'criando…' : 'Criar meu PIN e entrar'}
            </button>
            <button className="btn fantasma" style={{ margin: '10px auto 0', display: 'flex' }}
              disabled={ocupado} onClick={() => { setFase('inicio'); setAlvo(null); setErro(''); }}>
              não sou eu, voltar
            </button>
          </div>
        )}

        {fase === 'cadastro' && (
          <div className="escalacao">
            <label>Seu nome completo</label>
            <input value={fNome} disabled={ocupado} placeholder="nome e sobrenome"
              autoComplete="name" autoCapitalize="words" enterKeyHint="next"
              onChange={e => setFNome(e.target.value)} />

            <label style={{ marginTop: 14, display: 'block' }}>Seu WhatsApp (com DDD)</label>
            <input value={fTel} disabled={ocupado} placeholder="11999998888" type="tel" inputMode="tel"
              autoComplete="tel" enterKeyHint="next" onChange={e => setFTel(e.target.value)} />
            <p className="dim pequeno" style={{ margin: '6px 0 0' }}>
              É por ele que você confirma que é você, e é onde a organização te chama.
            </p>

            <label style={{ marginTop: 14, display: 'block' }}>E-mail <span className="dim">(opcional)</span></label>
            <input value={fEmail} disabled={ocupado} placeholder="seu@email.com" type="email" inputMode="email"
              autoComplete="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="done"
              onChange={e => setFEmail(e.target.value)} />

            <label style={{ marginTop: 22, display: 'block' }}>Onde você serve?</label>
            <p className="dim pequeno" style={{ margin: '-2px 0 12px' }}>
              {semNiveis
                ? 'Toque no posto que você já faz. Leia o que cada um exige antes de marcar.'
                : 'Toque no posto para entrar nele. Marque só o que é verdade hoje, quem organiza confere depois.'}
              {misturado && <> Posto <em>só domingo</em> não entra na escala do Follow.</>}
            </p>
            {avisoCadastro && <Aviso tom="info">{avisoCadastro}</Aviso>}
            {(() => {
              const tit = Object.values(fNiveis).filter(n => n === 'titular').length;
              if (tit < 3) return null;
              return (
                <p className="alerta-nivel">
                  Você marcou <strong>faço sozinho</strong> em {tit} áreas. Isso quer dizer que em todas elas
                  você segura tudo sem ninguém do lado. Se em alguma você ainda prefere estar acompanhado,
                  toque nela de novo até ficar <strong>ajudo quando falta</strong>. Ninguém aqui espera que
                  você saiba tudo.
                </p>
              );
            })()}
            <div className="postos">
              {grupos.map(([fam, itens]) => {
                const varios = itens.length > 1;
                const marcadosAqui = itens.filter(i => fNiveis[i.nome]);
                /* quando a família inteira é do mesmo tipo, a etiqueta sobe
                   para o título: repetida em cada posto ela só engordava os
                   botões até eles não caberem lado a lado. */
                const soDomFamilia = misturado && varios
                  && itens.every(i => !i.tipos.includes('follow'));
                return (
                  <div className="posto-grupo" key={fam}>
                    {varios && (
                      <div className="posto-fam">
                        {fam}{soDomFamilia && <i className="posto-tag">só domingo</i>}
                      </div>
                    )}
                    {/* a explicação é do grupo. Impressa em cada posto, o texto
                        do LÍDER saía duas vezes e o do SETOR quatro, e
                        repetição vira paisagem: para de ser lida. */}
                    {itens[0]?.familia && <p className="posto-fam-desc">{itens[0].familia}</p>}
                    {/* fechado, cada posto é só um botão pequeno numa fileira.
                        Uma linha inteira por posto deixava 12 cartões altos com
                        um dígito dentro. */}
                    <div className="posto-linha">
                      {itens.map(({ nome, tipos, descricao }) => {
                        const n = fNiveis[nome];
                        /* com explicação o posto precisa da linha inteira: a
                           descrição é o que faz a pessoa marcar certo. */
                        const largo = !varios || !!descricao;
                        return (
                          <button type="button" key={nome} aria-pressed={!!n}
                            className={`posto-op ${n ? 'on' : ''} ${largo ? 'largo' : ''}`}
                            onClick={() => marcarArea(nome, n ? null : (semNiveis ? 'titular' : 'reserva'))}>
                            <span className="posto-marca" aria-hidden="true">{n ? '✓' : '+'}</span>
                            <span className="cresce">
                              <span className="posto-titulo">
                                {varios ? (sufixo(nome) || nome) : nome}
                                {misturado && !soDomFamilia && !tipos.includes('follow')
                                  && <i className="posto-tag">só domingo</i>}
                              </span>
                              {descricao && <span className="posto-desc">{descricao}</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {/* aberto, o posto marcado ganha bloco próprio com o nível */}
                    {!semNiveis && marcadosAqui.map(({ nome }) => (
                      <div className="posto-nivel" key={nome}>
                        <span className="cresce">
                          <span className="overline">{nome}</span>
                          <span className="dim peq">
                            ajudo = com alguém do lado · sozinho = seguro o posto ·
                            aprendo = nunca fiz
                          </span>
                        </span>
                        <div className="conf-btns" role="group" aria-label={`O quanto você faz em ${nome}`}>
                          {OPCOES.map(o => (
                            <button type="button" key={o} className={`seg ${fNiveis[nome] === o ? 'on' : ''}`}
                              onClick={() => marcarArea(nome, o)}>{CURTO[o]}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <p className="dim pequeno postos-conta">
              {marcadas === 0 ? 'Nenhum posto marcado ainda.'
                : marcadas === 1 ? '1 posto marcado.' : `${marcadas} postos marcados.`}
            </p>

            {/* mesma regra do cadastro: botão que não pode ser apertado diz
                o que falta, senão a pessoa acha que o site travou */}
            {!ocupado && (!fNome.trim() || !fTel.trim() || !marcadas) && (
              <p className="postos-falta" role="status">
                {'Falta ' + [
                  !fNome.trim() && 'seu nome',
                  !fTel.trim() && 'seu WhatsApp',
                  !marcadas && 'marcar onde você serve',
                ].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' e $1') + '.'}
              </p>
            )}
            <button className="pri" style={{ marginTop: 20, width: '100%' }}
              disabled={ocupado || !fNome.trim() || !fTel.trim() || !marcadas} onClick={inscrever}>
              {ocupado ? 'entrando…' : 'Entrar no time'}
            </button>
            <button className="btn fantasma" style={{ margin: '10px auto 0', display: 'flex' }}
              disabled={ocupado} onClick={() => { setFase('inicio'); setErro(''); }}>
              voltar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

