/* =============================================================================
   O MAPA DOS SITES: menu, pé e busca, de uma fonte só · 11/10/2026

   A apresentação (ApresentaSite.pdf, tela 1) tem a barra com cinco grupos:
   Igreja, Eventos, Envolva-se, PGs, Doação, cada um com a seta, e a lupa.
   O site segue a apresentação. Cada grupo abre dois a cinco links; nenhum
   grupo é só rótulo: o rótulo também é um link (a página principal do
   grupo), para quem clica em vez de passar o mouse.

   A busca (lupa) procura nesta mesma lista mais os atalhos de BUSCA, que
   são perguntas que a pessoa digita ("horário", "estacionamento", "pix").

   19/10/2026: DOIS SITES, DOIS MAPAS. O Guia Church (guiachurch.com) e o
   Guia Servir (guiaservir.com) têm cada um a sua barra, o seu menu de
   celular e a sua busca, no mesmo desenho. Um aponta para o outro com
   endereço completo (lib/site/sites.ts): "Envolva-se" leva ao Servir, e o
   Servir tem o grupo "GUIA Church" de volta.

   20/10/2026: TRÊS. O Guia Follow (guiafollow.com, a página do culto de
   jovens) entrou na mesma barra e no mesmo pé, com o seu mapa: a própria
   página (âncoras), o Follow Camp, a igreja e o Servir. O "Follow" do menu
   da igreja passou a levar ao site dele.
   ============================================================================= */
import { IGREJA, MAPA, canalDeConversa } from '@/lib/igreja';
import { AREAS, AREAS_ORDEM } from '@/lib/site/areas';
import { noServir, naIgreja, noFollow, follow, lp } from '@/lib/site/sites';
import { FC27 } from '@/lib/followcamp';

export type Item = { rot: string; href: string; sub?: string; duro?: boolean };
/** `sub`: a linha sob a entrada do próprio grupo no painel, quando nenhum item já leva à página dele (Topo.tsx) */
export type Grupo = { rot: string; href: string; itens: Item[]; duro?: boolean; sub?: string };
export type Mapa = {
  /** a página de entrada do site (o símbolo da barra leva para cá) */
  inicio: string;
  menu: Grupo[];
  celular: Item[];
  busca: Item[];
  /** o espaço de quem já serve, no pé da cortina do celular */
  jaSirvo: string;
  /** os links da última linha do pé, depois do Instagram e do WhatsApp */
  pe: Item[];
  /** a dica da busca quando nada casa */
  nada: string;
};

/* ---------------------------------------------------------------- igreja --- */

export const MENU: Grupo[] = [
  { rot: 'Igreja', href: '/sobre', itens: [
    { rot: 'Quem somos', href: '/sobre', sub: 'O que acreditamos e por quê' },
    { rot: 'Cultos', href: '/cultos', sub: 'Domingo, 10h' },
    { rot: 'Como chegar', href: '/como-chegar', sub: 'Rua Pedra de Itaúna, 534' },
    { rot: 'Ao vivo', href: '/cultos#ao-vivo', sub: 'A mensagem de domingo' },
  ] },
  { rot: 'Eventos', href: '/eventos', itens: [
    { rot: 'Agenda', href: '/eventos', sub: 'O que acontece na semana' },
    /* 20/10/2026: o Follow tem site próprio (guiafollow.com) */
    { rot: 'Follow', href: noFollow('/'), sub: 'Sábado, 19h' },
    { rot: FC27.nome, href: '/followcamp', sub: FC27.datas, duro: true },
  ] },
  /* o grupo inteiro mora no Guia Servir */
  { rot: 'Envolva-se', href: noServir('/'), itens: [
    { rot: 'Quero servir', href: noServir('/'), sub: 'Encontre o seu lugar pra servir' },
    { rot: 'As áreas', href: noServir('/#areas'), sub: 'Mídia, Louvor, Kids, Connect, Livraria' },
    { rot: 'Não sei onde me encaixo', href: noServir('/servir/onde-me-encaixo'), sub: 'Três dúvidas comuns' },
    { rot: 'Já sirvo', href: noServir('/eu'), sub: 'Minha escala, meus dias, meu líder', duro: true },
  ] },
  { rot: 'PGs', href: '/pequena-guia', itens: [
    { rot: 'Pequena Guia', href: '/pequena-guia', sub: 'O grupo da semana' },
    { rot: 'Encontrar a minha', href: '/pequena-guia#encontrar', sub: 'Perto de onde você mora' },
  ] },
  /* 19/10/2026: dizia "Pix, cartão, Apple Pay e Google Pay", e o cartão
     está desligado em produção (sem a chave do adquirente, /ofertar só
     mostra o Pix). O menu não sabe se o cartão está ligado: fala do que
     é sempre verdade. */
  { rot: 'Doação', href: '/ofertar', itens: [
    { rot: 'Ofertar', href: '/ofertar', sub: 'Dízimos e ofertas' },
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
  { rot: 'Servir', href: noServir('/') },
  { rot: 'Ofertar', href: '/ofertar' },
  { rot: 'Quem somos', href: '/sobre' },
  { rot: 'Ao vivo', href: '/cultos#ao-vivo' },
  { rot: 'Como chegar', href: '/como-chegar' },
];

/* o que a busca encontra além do menu: a pergunta como a pessoa digita */
export const BUSCA: Item[] = [
  { rot: 'Que horas é o culto?', href: '/cultos', sub: 'Domingo, 10h' },
  { rot: 'Onde fica a igreja?', href: '/como-chegar', sub: 'Rua Pedra de Itaúna, 534, Barra da Tijuca' },
  { rot: 'Estacionamento', href: '/como-chegar#antes-de-vir', sub: 'A equipe orienta onde parar' },
  { rot: 'Primeira vez', href: '/cultos#primeira-vez', sub: 'O que esperar no domingo' },
  { rot: 'Crianças no culto', href: '/como-chegar#antes-de-vir', sub: 'GUIA Kids, do berçário aos 12 anos' },
  { rot: 'Pix da igreja', href: '/ofertar', sub: 'Dízimos e ofertas' },
  { rot: 'WhatsApp da igreja', href: '/como-chegar#conversa', sub: 'Fale com a gente' },
  { rot: 'Instagram', href: IGREJA.instagram, sub: IGREJA.instagramArroba, duro: true },
  ...AREAS_ORDEM.map(s => ({ rot: AREAS[s].nome, href: noServir(`/servir/${s}`), sub: `Servir · ${AREAS[s].frase}` })),
  { rot: 'Perdi meu link de voluntário', href: noServir('/acessar'), sub: 'Acesso às equipes' },
  { rot: 'Privacidade', href: '/privacidade', sub: 'O que fazemos com os seus dados' },
];

export const SITE_IGREJA_MAPA: Mapa = {
  inicio: '/', menu: MENU, celular: MENU_CELULAR, busca: BUSCA,
  jaSirvo: noServir('/eu'),
  pe: [
    { rot: 'Acesso às equipes', href: noServir('/acessar') },
    { rot: 'Privacidade', href: '/privacidade' },
  ],
  nada: 'Nada com esse nome. Tente "culto", "endereço", "servir" ou "pix".',
};

/* ---------------------------------------------------------------- servir --- */

/* A BARRA DO SERVIR. A mesma forma da barra da igreja (grupos com seta e
   painel), com o que quem pensa em servir procura: o que é e como funciona,
   as áreas, a porta de quem já serve e o caminho de volta para a igreja. */
export const MENU_SERVIR: Grupo[] = [
  { rot: 'Servir', href: lp(), itens: [
    { rot: 'Quero servir', href: lp('#quero-servir'), sub: 'Cadastro de menos de um minuto' },
    { rot: 'Como funciona', href: lp('#como-funciona'), sub: 'Do cadastro à escala, quatro passos' },
    { rot: 'Perguntas', href: lp('#perguntas'), sub: 'Antes do primeiro domingo' },
  ] },
  { rot: 'Áreas', href: lp('#areas'), sub: 'As cinco, lado a lado', itens: [
    ...AREAS_ORDEM.map(s => ({ rot: AREAS[s].nome, href: `/servir/${s}`, sub: AREAS[s].frase })),
    { rot: 'Não sei onde me encaixo', href: '/servir/onde-me-encaixo', sub: 'Três dúvidas comuns' },
  ] },
  /* o espaço do voluntário é sistema (outra folha de estilo): link duro */
  { rot: 'Já sirvo', href: '/eu', duro: true, itens: [
    { rot: 'Abrir meu espaço', href: '/eu', sub: 'Sua escala, seus dias e seu líder', duro: true },
    { rot: 'Acesso às equipes', href: '/acessar', sub: 'Voluntários e liderança' },
  ] },
  { rot: 'GUIA Church', href: naIgreja('/'), sub: 'O site da igreja', itens: [
    { rot: 'Cultos', href: naIgreja('/cultos'), sub: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}` },
    { rot: 'Como chegar', href: naIgreja('/como-chegar'), sub: IGREJA.rua },
    { rot: 'Quem somos', href: naIgreja('/sobre'), sub: 'A igreja' },
  ] },
];

export const MENU_CELULAR_SERVIR: Item[] = [
  { rot: 'Quero servir', href: lp('#quero-servir') },
  { rot: 'As áreas', href: lp('#areas') },
  { rot: 'Como funciona', href: lp('#como-funciona') },
  { rot: 'Não sei onde me encaixo', href: '/servir/onde-me-encaixo' },
  { rot: 'Perguntas', href: lp('#perguntas') },
  { rot: 'GUIA Church', href: naIgreja('/'), sub: `Cultos aos domingos, ${IGREJA.cultoHora}` },
];

export const BUSCA_SERVIR: Item[] = [
  { rot: 'Preciso ser membro para servir?', href: lp('#perguntas'), sub: 'Não' },
  { rot: 'Quanto tempo de domingo eu vou gastar?', href: lp('#perguntas'), sub: 'Depende do posto' },
  { rot: 'Como funciona a escala?', href: lp('#como-funciona'), sub: 'Você diz quando pode' },
  { rot: 'Não sei fazer nada', href: lp('#perguntas'), sub: 'Ninguém aqui começou sabendo' },
  { rot: 'Perdi meu link de voluntário', href: '/acessar', sub: 'Acesso às equipes' },
  { rot: 'PIN', href: '/eu', sub: 'Ache seu nome e entre, ou crie o seu', duro: true },
  { rot: 'Que horas é o culto?', href: naIgreja('/cultos'), sub: `GUIA Church · ${IGREJA.cultoDia}, ${IGREJA.cultoHora}` },
  { rot: 'Onde fica a igreja?', href: naIgreja('/como-chegar'), sub: IGREJA.rua },
  { rot: 'Instagram', href: IGREJA.instagram, sub: IGREJA.instagramArroba, duro: true },
  { rot: 'Privacidade', href: naIgreja('/privacidade'), sub: 'O que fazemos com os seus dados' },
];

export const SITE_SERVIR_MAPA: Mapa = {
  inicio: lp(), menu: MENU_SERVIR, celular: MENU_CELULAR_SERVIR, busca: BUSCA_SERVIR,
  jaSirvo: '/eu',
  pe: [
    { rot: 'GUIA Church', href: naIgreja('/') },
    { rot: 'Acesso às equipes', href: '/acessar' },
    { rot: 'Privacidade', href: naIgreja('/privacidade') },
  ],
  nada: 'Nada com esse nome. Tente "área", "escala", "PIN" ou "culto".',
};

/* ---------------------------------------------------------------- follow --- */

/* A BARRA DO FOLLOW · 20/10/2026. O site é uma página só: o primeiro grupo
   são as paradas dela (âncoras), e os outros três são as portas da rede da
   GUIA: o Follow Camp (que mora no guiachurch.com, pagamento no domínio),
   a igreja e o Servir. */
const CONVERSA_FOLLOW = canalDeConversa('Oi! Quero ir no Follow no sábado.');
const CAMP = naIgreja('/followcamp');

export const MENU_FOLLOW: Grupo[] = [
  { rot: 'Follow', href: follow(), itens: [
    { rot: 'Primeira vez', href: follow('#primeira-vez'), sub: 'Não precisa ser de igreja' },
    { rot: 'Quando e onde', href: follow('#quando'), sub: `Sábado, ${IGREJA.followHora}` },
    { rot: 'Avisar que vou', href: CONVERSA_FOLLOW.href, sub: 'A gente te espera na porta', duro: true },
  ] },
  { rot: 'Follow Camp', href: CAMP, duro: true, itens: [
    { rot: FC27.nome, href: CAMP, sub: `${FC27.datas} · inscrição e pagamento`, duro: true },
  ] },
  { rot: 'GUIA Church', href: naIgreja('/'), sub: 'O site da igreja', itens: [
    { rot: 'Cultos', href: naIgreja('/cultos'), sub: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}` },
    { rot: 'Como chegar', href: naIgreja('/como-chegar'), sub: IGREJA.rua },
    { rot: 'Pequena Guia', href: naIgreja('/pequena-guia'), sub: 'O grupo da semana' },
    { rot: 'Quem somos', href: naIgreja('/sobre'), sub: 'A igreja' },
  ] },
  { rot: 'Servir', href: noServir('/'), itens: [
    { rot: 'Quero servir', href: noServir('/'), sub: 'Encontre o seu lugar pra servir' },
    { rot: 'As áreas', href: noServir('/#areas'), sub: 'Mídia, Louvor, Kids, Connect, Livraria' },
    { rot: 'Já sirvo', href: noServir('/eu'), sub: 'Minha escala, meus dias, meu líder', duro: true },
  ] },
];

export const MENU_CELULAR_FOLLOW: Item[] = [
  { rot: 'Primeira vez', href: follow('#primeira-vez') },
  { rot: 'Quando e onde', href: follow('#quando'), sub: `Sábado, ${IGREJA.followHora}` },
  { rot: FC27.nome, href: CAMP, sub: FC27.datas, duro: true },
  { rot: 'Como chegar', href: naIgreja('/como-chegar') },
  { rot: 'GUIA Church', href: naIgreja('/'), sub: `Cultos aos domingos, ${IGREJA.cultoHora}` },
  { rot: 'Servir', href: noServir('/') },
];

export const BUSCA_FOLLOW: Item[] = [
  { rot: 'Que horas é o Follow?', href: follow('#quando'), sub: `Sábado, ${IGREJA.followHora}` },
  { rot: 'Onde fica?', href: follow('#quando'), sub: `${IGREJA.rua}, ${IGREJA.bairro}` },
  { rot: 'Não sou de igreja', href: follow('#primeira-vez'), sub: 'Vem assim mesmo' },
  { rot: 'Vou sozinho', href: follow('#primeira-vez'), sub: 'A gente te espera na porta' },
  { rot: 'O que eu visto?', href: follow('#primeira-vez'), sub: 'O que você já estava usando' },
  { rot: 'Quanto tempo dura?', href: follow('#primeira-vez'), sub: 'Mais ou menos uma hora e meia' },
  { rot: 'Preciso de inscrição?', href: follow('#quando'), sub: 'Não' },
  { rot: 'Abrir no mapa', href: MAPA, sub: IGREJA.rua, duro: true },
  { rot: 'WhatsApp', href: CONVERSA_FOLLOW.href, sub: 'Avisar que vou', duro: true },
  { rot: 'Instagram', href: IGREJA.instagram, sub: IGREJA.instagramArroba, duro: true },
  { rot: 'Culto de domingo', href: naIgreja('/cultos'), sub: `GUIA Church · ${IGREJA.cultoDia}, ${IGREJA.cultoHora}` },
  { rot: 'Privacidade', href: naIgreja('/privacidade'), sub: 'O que fazemos com os seus dados' },
];

export const SITE_FOLLOW_MAPA: Mapa = {
  inicio: follow(), menu: MENU_FOLLOW, celular: MENU_CELULAR_FOLLOW, busca: BUSCA_FOLLOW,
  jaSirvo: noServir('/eu'),
  pe: [
    { rot: 'GUIA Church', href: naIgreja('/') },
    { rot: 'Servir', href: noServir('/') },
    { rot: 'Privacidade', href: naIgreja('/privacidade') },
  ],
  nada: 'Nada com esse nome. Tente "sábado", "camp", "chegar" ou "igreja".',
};

export type QualSite = 'igreja' | 'servir' | 'follow';
export const MAPAS: Record<QualSite, Mapa> = { igreja: SITE_IGREJA_MAPA, servir: SITE_SERVIR_MAPA, follow: SITE_FOLLOW_MAPA };
