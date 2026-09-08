import Link from 'next/link';
import { IcSeta } from './Icones';

/* =============================================================================
   UM DOMINGO POR DENTRO — as áreas apresentadas pelo culto, não por grade

   Um site de igreja mostra ministérios como uma grade de cartões com foto:
   cinco retângulos iguais e nomes que não dizem nada para quem não é de
   dentro ("Connect", "Mídia"). Aqui as áreas aparecem onde elas acontecem:
   no domingo, momento a momento. A pessoa entende o que cada equipe faz
   porque vê ONDE ela entra no culto — e o "quero servir aqui" fica ao lado
   do momento, não numa página à parte.

   OS MOMENTOS SÃO ESCRITOS A PARTIR DAS DESCRIÇÕES QUE AS PRÓPRIAS ÁREAS
   DERAM (banco, `ministerios_publicos`): a Mídia "registra e transmite:
   câmera, projeção, luz, foto, edição e transmissão"; o Connect "cuida de
   quem chega: recepção, estacionamento, segurança, visitantes e os setores
   do salão"; o Kids "cuida, ensina e acompanha as crianças durante o culto,
   em quatro turmas"; o Louvor "conduz a igreja na adoração: vocal, banda,
   som e palco"; a Livraria "abre antes do culto e fecha depois". Nada aqui
   inventa horário nem função.

   O mapa momento → área é por slug. Área que não está no banco não ganha
   link; o momento continua, porque o domingo continua.
   ============================================================================= */

type Min = { slug: string; nome: string; postos: number; aberto: boolean };

const MOMENTOS: { n: string; t: string; d: string; areas: string[] }[] = [
  { n: '01', t: 'Antes de abrir', d: 'Som, luz e câmera ligados, o estacionamento pronto, a livraria aberta.', areas: ['midia', 'servico', 'livraria'] },
  { n: '02', t: 'Na porta', d: 'Alguém recebe você, indica o lugar e leva as crianças até a sala delas.', areas: ['servico'] },
  { n: '03', t: 'As crianças', d: 'Quatro turmas por faixa etária, com equipe própria, enquanto o culto acontece.', areas: ['kids'] },
  { n: '04', t: 'O louvor', d: 'Vocal, banda, som e palco conduzem a igreja na adoração.', areas: ['louvor'] },
  { n: '05', t: 'A palavra', d: 'No telão, na transmissão para quem está longe, guardada em foto e vídeo.', areas: ['midia'] },
  { n: '06', t: 'Depois', d: 'A livraria fecha por último. Alguém edita o que foi gravado.', areas: ['livraria', 'midia'] },
];

export function PorDentro({ mins, fase }: { mins: Min[]; fase: 'carregando' | 'pronto' | 'rede' }) {
  const porSlug = new Map(mins.map(m => [m.slug, m]));
  return (
    <ol className="momentos" aria-label="O domingo, momento a momento">
      {MOMENTOS.map(m => (
        <li key={m.n} className="momento">
          <span className="momento-n" aria-hidden="true">{m.n}</span>
          <div className="momento-txt">
            <h3 className="momento-t">{m.t}</h3>
            <p className="momento-d">{m.d}</p>
            <div className="momento-areas">
              {m.areas.map(slug => {
                const a = porSlug.get(slug);
                if (!a) return fase === 'carregando'
                  ? <span key={slug} className="momento-area esqueleto" aria-hidden="true" />
                  : null;
                return (
                  <Link key={slug} href={`/servir/${a.slug}`} className="momento-area">
                    <span className="momento-area-nome">{a.nome}</span>
                    <span className="momento-area-p">{a.postos} {a.postos === 1 ? 'posto' : 'postos'}{!a.aberto && ' · conversa antes'}</span>
                    <IcSeta />
                  </Link>
                );
              })}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
