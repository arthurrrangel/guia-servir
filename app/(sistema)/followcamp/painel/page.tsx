/* /followcamp/painel: o endereço fácil de lembrar. O painel mora na
   Administração das Demandas, que é onde a porta de entrada já existe. */
import { redirect } from 'next/navigation';

export const metadata = { robots: { index: false, follow: false } };

export default function Pagina() {
  redirect('/demandas/admin/followcamp');
}
