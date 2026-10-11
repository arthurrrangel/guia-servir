'use client';
import { useParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { EditorDoCronograma } from '@/components/escalas/Cronograma';
import { Vazio } from '@/components/escalas/Pecas';

/* /cronogramas/AAAA-MM-DD — a folha de um culto, para preencher e mandar.
   Data que não é data não chega ao banco. */
export default function Pagina() {
  const { data } = useParams<{ data: string }>();
  const valida = /^\d{4}-\d{2}-\d{2}$/.test(data || '') && !isNaN(Date.parse(`${data}T12:00:00Z`));
  return (
    <Shell>
      {valida ? <EditorDoCronograma data={data} />
        : <Vazio titulo="Esta data não existe" solto>Volte para a lista de cultos e escolha um.</Vazio>}
    </Shell>
  );
}
