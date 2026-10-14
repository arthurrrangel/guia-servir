/* =============================================================================
   O MAPA DO SITE — menu, pé e busca, de uma fonte só · 11/10/2026

   A apresentação (ApresentaSite.pdf, tela 1) tem a barra com cinco grupos:
   Igreja, Eventos, Envolva-se, PGs, Doação, cada um com a seta, e a lupa.
   O site segue a apresentação. Cada grupo abre dois a cinco links; nenhum
   grupo é só rótulo: o rótulo também é um link (a página principal do
   grupo), para quem clica em vez de passar o mouse.

   A busca (lupa) procura nesta mesma lista mais os atalhos de BUSCA, que
   são perguntas que a pessoa digita ("horário", "estacionamento", "pix").
   ============================================================================= */
import { IGREJA } from '@/lib/igreja';

export type Item = { rot: string; href: string; sub?: string; duro?: boolean };
export type Grupo = { rot: string; href: string; itens: Item[] };

export const MENU: Grupo[] = [
  { rot: 'Igreja', href: '/sobre', itens: [
    { rot: 'Quem somos', href: '/sobre', sub: 'O que acreditamos e por quê' },
    { rot: 'Cultos', href: '/cultos', sub: 'Domingo, 10h' },
    { rot: 'Como chegar', href: '/como-chegar', sub: 'Rua Pedra de Itaúna, 534' },
    { rot: 'Ao vivo', href: '/cultos#ao-vivo', sub: 'A mensagem de domingo' },
  ] },
  { rot: 'Eventos', href: '/eventos', itens: [
    { rot: 'Agenda', href: '/eventos', sub: 'O que acontece na semana' },
    { rot: 'Follow', href: '/eventos#follow', sub: 'Sábado, 19h' },
    { rot: 'Follow Camp 2027', href: '/followcamp', sub: '05 a 10 de fevereiro', duro: true },
  ] },
  { rot: 'Envolva-se', href: '/servir', itens: [
    { rot: 'Quero servir', href: '/servir', sub: 'Existe um lugar para você' },
    { rot: 'As áreas', href: '/servir#areas', sub: 'Mídia, Louvor, Kids, Connect, Livraria' },
    { rot: 'Não sei onde me encaixo', href: '/servir/onde-me-encaixo', sub: 'Três perguntas e a resposta' },
    { rot: 'Já sirvo', href: '/eu', sub: 'Minha escala, meus dias, meu líder', duro: true },
  ] },
  { rot: 'PGs', href: '/pequena-guia', itens: [
    { rot: 'Pequena Guia', href: '/pequena-guia', sub: 'O grupo da semana' },
    { rot: 'Encontrar a minha', href: '/pequena-guia#encontrar', sub: 'Perto de onde você mora' },
  ] },
  { rot: 'Doação', href: '/ofertar', itens: [
    { rot: 'Ofertar', href: '/ofertar', sub: 'Pix, cartão, Apple Pay e Google Pay' },
    { rot: 'Por que ofertamos', href: '/ofertar#porque', sub: 'Generosidade é um dos três pilares' },
  ] },
];

/* O MENU DO CELULAR · 14/10/2026
   A cortina repetia os cinco grupos da barra: 1.819 px numa janela de 600
   (três telas de rolagem), 22 links para 12 destinos (o rótulo do grupo e o
   primeiro item iam para a mesma página) e 15 subtítulos. Servir, PGs e
   Ofertar só apareciam depois de rolar. No celular o menu é a lista dos
   destinos, numa tela: o fato ao lado só onde ele é fato (a hora). Os grupos
   da apresentação continuam na barra do computador (MENU, acima). */
export const MENU_CELULAR: Item[] = [
  { rot: 'Cultos', href: '/cultos', sub: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}` },
  { rot: 'Eventos', href: '/eventos', sub: IGREJA.followHora ? `Follow aos sábados, ${IGREJA.followHora}` : 'Follow e Camp' },
  { rot: 'Pequena Guia', href: '/pequena-guia' },
  { rot: 'Servir', href: '/servir' },
  { rot: 'Ofertar', href: '/ofertar' },
  { rot: 'Quem somos', href: '/sobre' },
  { rot: 'Ao vivo', href: '/cultos#ao-vivo' },
  { rot: 'Como chegar', href: '/como-chegar' },
];

/* o que a busca encontra além do menu: a pergunta como a pessoa digita */
export const BUSCA: Item[] = [
  { rot: 'Que horas é o culto?', href: '/cultos', sub: 'Domingo, 10h' },
  { rot: 'Onde fica a igreja?', href: '/como-chegar', sub: 'Rua Pedra de Itaúna, 534, Barra da Tijuca' },
  { rot: 'Estacionamento', href: '/cultos#como-chegar', sub: 'Equipe na porta orienta onde parar' },
  { rot: 'Primeira vez', href: '/cultos#primeira-vez', sub: 'O que esperar no domingo' },
  { rot: 'Crianças no culto', href: '/cultos#primeira-vez', sub: 'GUIA Kids, do berçário aos 12 anos' },
  { rot: 'Pix da igreja', href: '/ofertar', sub: 'Dízimos e ofertas' },
  { rot: 'WhatsApp da igreja', href: '/como-chegar#conversa', sub: 'Fale com a gente' },
  { rot: 'Instagram', href: 'https://instagram.com/guiachurch', sub: '@guiachurch', duro: true },
  { rot: 'Mídia', href: '/servir/midia', sub: 'Imagem, luz, som e transmissão' },
  { rot: 'Louvor', href: '/servir/louvor', sub: 'A banda, o som e a adoração' },
  { rot: 'GUIA Kids', href: '/servir/kids', sub: 'Servir com as crianças' },
  { rot: 'Connect', href: '/servir/servico', sub: 'Recepção, estacionamento e cozinha' },
  { rot: 'Livraria', href: '/servir/livraria', sub: 'Livros e recursos na saída do culto' },
  { rot: 'Perdi meu link de voluntário', href: '/acessar', sub: 'Acesso às equipes' },
  { rot: 'Privacidade', href: '/privacidade', sub: 'O que fazemos com os seus dados' },
];
