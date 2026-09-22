'use client';
/* As peças. Poucas de propósito: o que separa as coisas aqui é espaço e peso,
   não borda nem cor. */

import { useEffect, useState } from 'react';

export function Aviso({ tom, children }: {
  tom: 'ok' | 'warn' | 'bad' | 'info'; children: React.ReactNode;
}) {
  /* leitor de tela: erro interrompe, o resto é gentil. Um aviso que aparece
     depois de uma ação e não é anunciado deixa a pessoa cega sem saber o que
     aconteceu. */
  return <div className={`dm-aviso dm-${tom}`} role={tom === 'bad' ? 'alert' : 'status'}>{children}</div>;
}

export function Pill({ tom, children }: {
  tom?: 'ok' | 'warn' | 'bad' | 'info'; children: React.ReactNode;
}) {
  return <span className={`dm-pill ${tom ? 'dm-' + tom : ''}`}>{children}</span>;
}

export function Campo({ rot, ajuda, children }: {
  rot: string; ajuda?: string; children: React.ReactNode;
}) {
  return (
    <label className="dm-campo">
      <span>{rot}</span>
      {children}
      {ajuda ? <small>{ajuda}</small> : null}
    </label>
  );
}

/** O mesmo desenho do `Campo`, SEM o `<label>`.

    UM `<label>` ROTULA O PRIMEIRO DESCENDENTE ROTULAVEL, E ISSO E UM
    DEFEITO QUANDO O CONTEUDO E UM GRUPO — 21/09/2026.

    `<Campo rot="Prioridade"><Opcoes …/></Campo>` punha quatro `<button>`
    dentro de um `<label>`. Tocar na palavra "Prioridade" ativava o PRIMEIRO
    deles. Medido, clicando no pixel do rotulo e em nenhum botao:

      prioridade ANTES : Baixa:false Normal:true Alta:false Urgente:false
      rotulo achado    : {"x":38,"y":828,"txt":"Prioridade"}
      prioridade DEPOIS: Baixa:true  Normal:false …

    A pessoa encosta o polegar na palavra enquanto rola, e a demanda urgente
    que ela ia abrir sai como "Baixa". Nada avisa, e a prioridade errada muda
    a ordem da fila.

    `Opcoes` ja traz `role="group"` e `aria-label`, entao o grupo se rotula
    sozinho: o `<label>` nao estava fazendo falta nenhuma, so estrago. */
export function Bloco({ rot, ajuda, children }: {
  rot: string; ajuda?: string; children: React.ReactNode;
}) {
  return (
    <div className="dm-campo">
      <span>{rot}</span>
      {children}
      {ajuda ? <small>{ajuda}</small> : null}
    </div>
  );
}

/** Escolha de poucas opções: botão em vez de select. Um toque, não dois. */
export function Opcoes<T extends string>({ valor, opcoes, aoMudar, rot }: {
  valor: T; opcoes: { v: T; rot: string }[]; aoMudar: (v: T) => void; rot: string;
}) {
  return (
    <div className="dm-opcoes" role="group" aria-label={rot}>
      {opcoes.map(o => (
        <button key={o.v} type="button" aria-pressed={valor === o.v} onClick={() => aoMudar(o.v)}>
          {o.rot}
        </button>
      ))}
    </div>
  );
}

/* O esqueleto e `aria-hidden` de proposito: forma piscando nao tem o que
   dizer a quem nao ve. So que ele era a UNICA coisa na tela enquanto a lista
   carregava, e com a rede lenta isso dava 2,5 segundos de silencio absoluto
   para quem usa leitor de tela. Medido: `aria-live`, `role=status`,
   `role=alert` e `aria-busy` — nenhum, em nenhum momento.

   Uma linha visualmente escondida e anunciada resolve. Ela e `status` e nao
   `alert`: carregar nao interrompe ninguem. */
export function Esqueleto({ linhas = 4, oQue = 'Carregando' }: { linhas?: number; oQue?: string }) {
  return (
    <>
    <span role="status" className="dm-so-leitor">{oQue}…</span>
    <div className="dm-esqueleto" aria-hidden="true">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} style={{ height: i === 0 ? 92 : 64, marginBottom: 10, width: i === linhas - 1 ? '70%' : '100%' }} />
      ))}
    </div>
    </>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="dm-card dm-centro" style={{ padding: 'var(--dm-e5) var(--dm-e3)' }}>
      <div className="dm-rot" style={{ marginBottom: 6 }}>{'>'} nada aqui</div>
      <h3 style={{ marginBottom: 8 }}>{titulo}</h3>
      <div className="dm-peq dm-mudo">{children}</div>
    </div>
  );
}

/* Caixa de texto que vira ação: o padrão de "concluir", "travar", "cancelar".
   O botão só liga quando há texto, porque o banco vai recusar vazio de
   qualquer jeito e é melhor a pessoa ver isso antes de tocar. */
export function CaixaDeAcao({ rot, dica, botao, tom, exigeTexto = true, salvando, aoEnviar, extra,
                             teto = 4000, podeEnviar = true }: {
  rot: string; dica?: string; botao: string;
  tom?: 'pri' | 'perigo'; exigeTexto?: boolean; salvando?: boolean;
  /* DEVOLVE `false` QUANDO O SERVIDOR RECUSOU — e a caixa não apaga nada.
     Ver o comentário do `onClick`. Quem não tem o que responder devolve
     `void`, e aí a caixa limpa como antes. */
  aoEnviar: (texto: string) => void | boolean | Promise<void | boolean>;
  extra?: React.ReactNode; teto?: number;
  /* O BOTAO SO OLHAVA O TEXTAREA, E HAVIA CAMPO OBRIGATORIO FORA DELE.

     "Concluir" numa demanda atrasada precisa do motivo do atraso, que mora no
     `extra`. O botao ficava habilitado so com a conclusao preenchida, a pessoa
     tocava, e o servidor recusava com ATRASO_PRECISA_MOTIVO. Quem monta a
     caixa sabe o que mais e obrigatorio; esta porta e para ele dizer. */
  podeEnviar?: boolean;
}) {
  const [t, setT] = useState('');
  /* O TETO NAO E ZELO, E O QUE IMPEDE A FICHA DE FICAR PESADA PARA SEMPRE.

     Esta peca e uma so e serve sete usos: comentar, concluir, travar,
     cancelar, reabrir, aprovar e recusar. Nenhum deles tinha limite, e
     medido: um comentario de 49.600 letras entrou pela porta de verdade, e
     outro de 200.000 pela RPC. Dali em diante `dem_ver` desce isso para
     TODA pessoa que abrir aquela demanda, no 4G da igreja, para sempre, e
     ninguem liga o lento ao comentario.

     A migracao 86 pos o teto no banco. Aqui ele aparece ANTES do toque: o
     contador so surge perto do fim, porque um contador sempre visivel numa
     caixa de comentario e ruido que ninguem pediu. */
  const sobra = teto - t.length;
  return (
    <div className="dm-card">
      <Campo rot={rot} ajuda={dica}>
        <textarea value={t} maxLength={teto} onChange={e => setT(e.target.value)} />
      </Campo>
      {sobra < 300
        ? <div className="dm-peq dm-mudo" role="status">{sobra} letra{sobra === 1 ? '' : 's'} restante{sobra === 1 ? '' : 's'}</div>
        : null}
      {extra}
      {/* A CAIXA APAGAVA O TEXTO ANTES DE SABER SE DEU CERTO — 22/09/2026.

          Era `onClick={() => { aoEnviar(t.trim()); setT(''); }}`: dispara e
          limpa, na mesma linha, sem esperar resposta nenhuma. Em QUALQUER
          recusa do servidor — concluir, cancelar, reabrir, aprovar, recusar,
          destravar, travar — a pessoa lê o aviso vermelho com a caixa VAZIA e
          tem que redigitar o que já tinha escrito.

          E não é caso raro: é justamente o caminho dos erros que esta entrega
          está consertando. `ATRASO_PRECISA_MOTIVO` num texto de conclusão de
          800 letras, `SO_GESTOR_REABRE_APROVACAO` numa trava, `FALTA_APROVACAO`
          num concluir. Quanto mais a pessoa escreveu, mais caro sai o erro, e
          a segunda tentativa vem pior que a primeira porque ninguém redigita
          com o mesmo cuidado.

          Agora a limpeza espera a promessa e só acontece quando não foi
          recusa. `false` é o único valor que segura o texto: assim quem não
          responde nada (`void`) continua limpando, como antes. */}
      <button className={`dm-btn dm-${tom || 'pri'} dm-larga`}
        disabled={salvando || !podeEnviar || (exigeTexto && !t.trim())}
        onClick={async () => { if (await aoEnviar(t.trim()) !== false) setT(''); }}>
        {salvando ? 'Salvando…' : botao}
      </button>
    </div>
  );
}

/** Copia para a área de transferência e diz que copiou — ou que não copiou.

    O `catch {}` VAZIO ERA UM BOTÃO QUE MENTE — 19/09/2026.

    A versão anterior tentava `navigator.clipboard.writeText` e engolia a
    falha. Quando falhava, o rótulo simplesmente não mudava: a pessoa tocava,
    nada acontecia, nada explicava, e ela ia colar uma área de transferência
    vazia no grupo do WhatsApp.

    E falha com frequência: `navigator.clipboard` exige contexto seguro e,
    em vários navegadores, gesto do usuário reconhecido — dentro de um
    `async` que já cedeu a vez, o gesto pode ter expirado. É por isso que o
    `copiar()` do outro sistema (`components/Shell.tsx`) tem o plano B com
    `execCommand` e avisa quando os dois falham. Aqui faltava.

    Três estados agora, e o terceiro é o que importa: copiou, não copiou, e
    o texto à mostra para a pessoa selecionar com o dedo. */
export function Copiar({ texto, rot = 'Copiar' }: { texto: string; rot?: string }) {
  const [fase, setFase] = useState<'' | 'feito' | 'falhou'>('');
  useEffect(() => {
    if (fase !== 'feito') return;
    const i = setTimeout(() => setFase(''), 1800);
    return () => clearTimeout(i);
  }, [fase]);

  async function tentar() {
    try { await navigator.clipboard.writeText(texto); setFase('feito'); return; } catch { /* plano B */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = texto; ta.readOnly = true;
      ta.style.position = 'fixed'; ta.style.left = '-9999px'; ta.style.top = '0';
      document.body.appendChild(ta); ta.select();
      const deu = document.execCommand('copy');
      ta.remove();
      setFase(deu ? 'feito' : 'falhou');
    } catch { setFase('falhou'); }
  }

  if (fase === 'falhou') {
    return (
      <span className="dm-copiar-falhou">
        <span className="dm-peq dm-mudo">Não consegui copiar. Selecione e copie:</span>
        <textarea className="dm-copiar-cru" readOnly rows={3} value={texto}
          onFocus={e => e.currentTarget.select()} />
      </span>
    );
  }
  return (
    <button className="dm-btn dm-peq" onClick={tentar}>{fase === 'feito' ? 'Copiado' : rot}</button>
  );
}
