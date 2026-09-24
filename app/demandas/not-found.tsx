/* A página que não existe, com a porta do Demandas (ver `[...resto]`). */
import Link from 'next/link';
import { Porta } from '@/components/demandas/Porta';

export default function NaoAchei() {
  return (
    <Porta>
      <div className="dm-rot">Página não encontrada</div>
      <h1>Essa página não existe</h1>
      <p className="dm-auth-sub">O endereço pode ter sido digitado errado, ou a página mudou de lugar.</p>
      <Link className="dm-btn dm-pri dm-larga" href="/demandas">Ir para o Início</Link>
    </Porta>
  );
}
