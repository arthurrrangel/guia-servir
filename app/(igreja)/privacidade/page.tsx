import type { Metadata } from 'next';
import { IGREJA, ENDERECO_LINHA, canalDeConversa } from '@/lib/igreja';
import { Vozes, Sede, Chapeu, Pil, fim, inteiro, liga, ligaTexto } from '@/components/site/Blocos';

/* =============================================================================
   /privacidade — OBRIGATÓRIA, NÃO OPCIONAL · 11/10/2026

   O cadastro de voluntário coleta nome, telefone e e-mail; o sistema guarda
   escala, disponibilidade e PIN; o link pessoal é um dado. Sem política
   publicada, a coleta é irregular. Escrita pra ser lida: cada bloco
   responde uma pergunta em linguagem de gente. O texto é o de 09/2026,
   revisado em 11/10/2026 só na forma.

   PENDENTE, e é decisão de quem responde pela igreja: o prazo exato de
   retenção do histórico de escala, e o nome do encarregado de dados.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Privacidade',
  description: 'Como a GUIA Church trata os dados de quem se cadastra para servir e de quem entra em contato pelo site. O que é coletado, por quanto tempo fica e como pedir exclusão.',
  alternates: { canonical: '/privacidade' },
};

const CONTATO = canalDeConversa('Oi! É sobre os meus dados no site da GUIA.');

const BLOCOS: Array<{ n: string; t: string; it: string; itens: Array<{ q: string; r: string }> }> = [
  { n: '01', t: 'O que é coletado', it: 'coletado', itens: [
    { q: 'Quando você se cadastra para servir', r: 'Nome completo, telefone com WhatsApp e, se quiser, e-mail. Junto vai a área escolhida e as funções de interesse. É o mínimo para a liderança daquela área falar com você e montar a escala.' },
    { q: 'Enquanto você serve', r: 'Em quais cultos você foi escalado, se confirmou ou pediu troca, os dias em que marcou indisponibilidade, e as observações que você mesmo escreve. Um PIN de quatro números, escolhido por você, protege esse espaço.' },
    { q: 'Quando você fala com a gente pelo site', r: `Os botões de conversa abrem o ${IGREJA.whatsapp ? 'WhatsApp' : 'Instagram'} com uma mensagem já escrita. O que você manda por lá fica no aplicativo, sob a política dele. Este site não guarda cópia da conversa.` },
    { q: 'Quando você pede uma Pequena Guia', r: 'Nome, telefone, CEP, idade e o melhor dia. Vão para uma planilha da igreja que a equipe das Pequenas Guias lê, só para apontar o grupo mais perto de você.' },
    { q: 'Quando você faz a ficha do Follow Camp', r: 'Nome, data de nascimento, sexo, tamanho da camisa, WhatsApp, alergias e informações de saúde do campista; se for menor de 18 anos, nome, CPF, WhatsApp e parentesco do responsável; se não for, um contato de emergência. Servem só para organizar o retiro e cuidar de quem está lá, e ficam no banco do site, numa área separada que só a administração do Follow Camp lê, pelo painel dela. Quando você avisa pelo site que pagou, o nome do campista, o valor, o código do pagamento e o nome de quem pagou ficam no mesmo lugar, para a organização conferir.' },
    { q: 'Quando você paga pelo site', r: 'Quando o Pix é gerado pela Stone, o nome, o CPF, o e-mail e o celular de quem paga vão direto para a Stone, que processa o pagamento sob a política dela. Os dados do cartão são sempre digitados na página da própria Stone. Este site não guarda nenhum desses dados. Na oferta por Pix, o site só monta o código: não fala com banco nenhum e não grava nada.' },
  ] },
  { n: '02', t: 'O seu link pessoal é um dado', it: 'dado', itens: [
    { q: 'Fora da busca', r: 'As páginas de acesso pessoal saem com instrução de não indexação e estão bloqueadas no robots.txt. Um código desses indexado seria a escala de uma pessoa aparecendo no Google.' },
    { q: 'Prévia sem conteúdo', r: 'Quando alguém encaminha o link num grupo, o WhatsApp busca a página para montar a prévia. A prévia é fixa e genérica: nome nenhum, escala nenhuma.' },
    { q: 'Não repasse', r: 'Como o link é a credencial, quem recebe o seu link entra no seu espaço. Se você acha que ele circulou, fale com o organizador da sua equipe.' },
  ] },
  { n: '03', t: 'Quem acessa, e onde fica', it: 'fica', itens: [
    { q: 'Quem tem acesso', r: 'A liderança da sua área e a organização das escalas. O acesso é controlado no próprio banco de dados, por regra de permissão: um líder enxerga a equipe dele, não a igreja inteira.' },
    { q: 'Onde os dados ficam', r: 'Num banco de dados hospedado no Supabase; o site é publicado pela Vercel. As duas atuam como operadoras: processam por conta da igreja e não usam esses dados para nada próprio.' },
    { q: 'O que nunca acontece', r: 'Seus dados não são vendidos, não são cedidos a terceiros e não alimentam publicidade. Não há cookie de rastreamento nem pixel de rede social. A única exceção são os mapas nas páginas Cultos, Como chegar e Pequena Guia: ao abri-las, o Google e o OpenStreetMap podem gravar cookies próprios, sob as políticas deles.' },
    { q: 'Por quanto tempo ficam', r: 'Enquanto você fizer parte de uma equipe. Quando alguém deixa de servir, o cadastro é encerrado e o histórico de escalas é mantido só pelo tempo necessário à organização da igreja, e apagado a qualquer momento, se você pedir.' },
  ] },
];

export default function Privacidade() {
  return (
    <>
      <section className="s-faixa noite s-grao">
        <div className="s-in">
          <Chapeu forte="Privacidade" resto="LGPD · Lei 13.709/2018" />
          <Vozes as="h1" className="s-h1" it="quê" >O que a gente guarda, e por quê</Vozes>
          <p className="s-lead grande" style={{ marginTop: 22 }}>{ligaTexto("Só quando você digita. Nunca é vendido, cedido nem usado em publicidade.")}</p>
          <p className="s-micro" style={{ marginTop: 16, opacity: .7 }}>{ligaTexto("Atualizada em outubro de 2026")}</p>
        </div>
      </section>

      {BLOCOS.map((b, i) => (
        <section key={b.n} className={'s-faixa ' + (i % 2 === 0 ? 'papel' : 'areia')} aria-labelledby={`t-${b.n}`}>
          <div className="s-in">
            <div className="s-cab s-rev">
              <p className="s-selo">{b.n}</p>
              <Vozes id={`t-${b.n}`} className="s-h2 media" it={b.it}>{b.t}</Vozes>
            </div>
            <div className="s-abre s-rev d1" style={{ marginInline: 0 }}>
              {b.itens.map((it, j) => (
                <details key={it.q} open={j === 0}>
                  <summary>{liga(inteiro(it.q))}</summary>
                  <div><p>{fim(inteiro(it.r))}</p></div>
                </details>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="s-faixa noite s-grao justa" aria-labelledby="t-pedir">
        <div className="s-in">
          <div className="s-claro s-rev">
            <Sede />
            <h2 id="t-pedir" className="s-h2 menor">{liga("O que você pode pedir.")}</h2>
            <p className="s-lead">{ligaTexto("Acesso, correção, exclusão. Sem custo, sem justificativa. Diga seu nome completo e a área em que você serve ou serviu. A resposta sai em até 15 dias.")}</p>
            <div className="s-qa">
              <div><b>Controladora</b><p>{IGREJA.nome}<br />{fim(ENDERECO_LINHA)}</p></div>
            </div>
            <div className="s-acoes centro"><Pil href={CONTATO.href} fora tom="preta">{CONTATO.rot}</Pil></div>
          </div>
        </div>
      </section>
    </>
  );
}
