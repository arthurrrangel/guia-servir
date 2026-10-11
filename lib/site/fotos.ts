/* =============================================================================
   AS FOTOS DO SITE — um lugar por foto, uma linha por lugar · 11/10/2026

   O site novo (app/(site)/) não escreve caminho de foto em página nenhuma:
   pede `foto('home-heroi')`. Cada lugar está registrado aqui com o arquivo
   ATUAL, o corte que o lugar faz, o ponto que não pode ser cortado e a
   instrução do que a foto precisa mostrar.

   11/10/2026: o Arthur vai mandar fotos novas ("não quero fotos antigas").
   A lista que ele recebeu é a deste arquivo, na mesma ordem. Enquanto não
   chegam, cada lugar aponta para a melhor foto que já existe em
   public/fotos/. Trocar é: salvar a nova em public/site/<nome>.webp (o
   script scripts/site-fotos.py recorta, trata e gera a versão pequena) e
   trocar UMA linha aqui.

   `corte`: H = horizontal (3:2 a 16:9), V = vertical (4:5), Q = quadrada
   (vira círculo). `foco`: o ponto da imagem que fica no centro quando o
   lugar corta ("50% 30%" = centro, um pouco acima).
   ============================================================================= */
export type Foto = {
  arquivo: string;
  /** a versão pequena (640px) para o celular, quando existe */
  pequena?: string;
  largura: number;
  altura: number;
  corte: 'H' | 'V' | 'Q';
  foco?: string;
  alt: string;
  nota: string;
};

export const FOTOS = {
  /* ---------------------------------------------------------------- home */
  'home-heroi': { arquivo: '/fotos/pregacao.webp', pequena: '/fotos/pregacao-s.webp', largura: 1080, altura: 1130, corte: 'H', foco: '60% 30%', alt: 'Culto de domingo na GUIA Church',
    nota: '1. O salão cheio durante o culto, visto de trás, luz de palco, com área escura pro título.' },
  'home-abraco': { arquivo: '/fotos/abraco-palco-v.webp', largura: 496, altura: 620, corte: 'V', alt: 'Abraço no fim do culto',
    nota: '2. Abraço ou recepção na porta, duas pessoas, close. A foto ao lado da frase.' },
  'home-circulo-1': { arquivo: '/fotos/louvor-q.webp', largura: 900, altura: 900, corte: 'Q', alt: '',
    nota: '3. Louvor com mão levantada, close.' },
  'home-circulo-2': { arquivo: '/fotos/porta-q.webp', largura: 533, altura: 533, corte: 'Q', alt: '',
    nota: '3. Equipe de camisa GUIA vista de costas.' },
  /* -------------------------------------------------------------- servir */
  'servir-heroi': { arquivo: '/fotos/fachada.webp', pequena: '/fotos/fachada-m.webp', largura: 2000, altura: 1344, corte: 'H', foco: '50% 40%', alt: 'A fachada da GUIA Church ao entardecer',
    nota: '4. A fachada ao entardecer (a de 10/10/2026).' },
  'area-midia': { arquivo: '/fotos/midia.webp', largura: 1800, altura: 1012, corte: 'H', foco: '50% 40%', alt: 'A mesa da mídia durante o culto',
    nota: '5. Mídia: mesa de corte ou câmera com a pessoa operando.' },
  'area-louvor': { arquivo: '/fotos/louvor-cor.webp', largura: 1012, altura: 1174, corte: 'H', foco: '50% 35%', alt: 'A banda no palco',
    nota: '6. Louvor: a banda inteira no palco.' },
  'area-kids': { arquivo: '/fotos/kids-sala.webp', largura: 1080, altura: 430, corte: 'H', alt: 'A sala da GUIA Kids',
    nota: '7. Kids: voluntária com crianças, sem rosto de criança de frente.' },
  'area-servico': { arquivo: '/fotos/porta-sorriso.webp', largura: 730, altura: 425, corte: 'H', alt: 'A recepção na porta',
    nota: '8. Connect: recepção na porta, aperto de mão ou abraço.' },
  'area-livraria': { arquivo: '/fotos/livraria.webp', largura: 1200, altura: 1282, corte: 'H', foco: '50% 45%', alt: 'A mesa da livraria',
    nota: '9. Livraria: a mesa de livros com alguém atendendo.' },
  /* -------------------------------------------------------------- cultos */
  'cultos-heroi': { arquivo: '/fotos/pastor-aponta.webp', largura: 1080, altura: 765, corte: 'H', foco: '50% 30%', alt: 'A pregação no culto de domingo',
    nota: '10. Pregação, o pastor no palco.' },
  'cultos-1': { arquivo: '/fotos/porta-sorriso.webp', largura: 730, altura: 425, corte: 'V', alt: 'Acolhida na porta', nota: '11. Acolhida na porta.' },
  'cultos-2': { arquivo: '/fotos/louvor-cor.webp', largura: 1012, altura: 1174, corte: 'V', alt: 'Louvor', nota: '11. Louvor.' },
  'cultos-3': { arquivo: '/fotos/pregacao.webp', pequena: '/fotos/pregacao-s.webp', largura: 1080, altura: 1130, corte: 'V', alt: 'Palavra', nota: '11. Palavra.' },
  'cultos-4': { arquivo: '/fotos/oracao.webp', largura: 1080, altura: 582, corte: 'V', alt: 'Oração no fim do culto', nota: '11. Oração no fim.' },
  /* ----------------------------------------------------------- quem somos */
  'sobre-heroi': { arquivo: '/fotos/congregacao.webp', largura: 1500, altura: 667, corte: 'H', foco: '50% 40%', alt: 'A igreja reunida',
    nota: '12. A igreja inteira, muita gente, de frente.' },
  'sobre-comunidade': { arquivo: '/fotos/ceia.webp', largura: 1080, altura: 945, corte: 'H', foco: '50% 40%', alt: 'Pessoas conversando depois do culto',
    nota: '13. Pessoas conversando depois do culto, mesa de café ou pátio.' },
  /* --------------------------------------------------------- pequena guia */
  'pg-heroi': { arquivo: '/fotos/abraco.webp', largura: 545, altura: 425, corte: 'H', alt: 'Uma Pequena Guia reunida',
    nota: '14. Um grupo numa casa, roda de pessoas no sofá.' },
  'pg-biblia': { arquivo: '/fotos/teclado.webp', largura: 800, altura: 1067, corte: 'V', alt: '', nota: '14. Close de Bíblia aberta no colo.' },
  /* -------------------------------------------------------------- eventos */
  'evento-follow': { arquivo: '/fotos/louvor-pb.webp', largura: 1080, altura: 1235, corte: 'H', foco: '50% 30%', alt: 'O Follow, culto de jovens',
    nota: '15. Follow: jovens no sábado.' },
  'evento-camp': { arquivo: '/fotos/equipe.webp', largura: 1000, altura: 1150, corte: 'H', foco: '50% 35%', alt: 'Follow Camp',
    nota: '15. Follow Camp: uma do acampamento.' },
  /* ------------------------------------------------------ ofertar e fecho */
  'ofertar-heroi': { arquivo: '/fotos/oferta.webp', largura: 1200, altura: 533, corte: 'H', alt: '',
    nota: '16. Mãos ou Bíblia, luz baixa.' },
  'fecho': { arquivo: '/fotos/oracao.webp', largura: 1080, altura: 582, corte: 'H', alt: '',
    nota: '16. Foto escura do culto pro bloco final das páginas.' },
  'chegar-heroi': { arquivo: '/fotos/predio.webp', largura: 740, altura: 498, corte: 'H', alt: 'A fachada da GUIA Church de dia',
    nota: 'Fachada de dia, com a placa, pra pessoa reconhecer a porta.' },
} as const satisfies Record<string, Foto>;

export type LugarDeFoto = keyof typeof FOTOS;

export const foto = (id: LugarDeFoto): Foto => FOTOS[id];
