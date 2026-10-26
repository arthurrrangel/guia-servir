/* A CONFIGURAÇÃO DO ROBÔ DO WHATSAPP · 26/10/2026.

   Decisões do Arthur em 26/10: escala automática só da Mídia, por robô
   próprio (sem navegador), rodando no MacBook dele, pelo número da igreja.
   Depois, no mesmo dia: "Gostaria de na aba do sistema ter a opção de
   disparar escala, através desse robo" e "Para todos os ministérios". Então:
     · Mídia: sai sozinha 2 dias antes (as rodadas abaixo) e também a pedido;
     · Louvor e Connect: só a pedido, pelo botão "Mandar agora pelo robô" do
       "Mandar nos grupos" (o Arthur desligou o envio automático do Louvor em
       16/10, e isso continua valendo);
     · GUIA Kids e Livraria não têm grupo na tabela: o botão não aparece.
   A tabela de grupos é a do robô de 08/10 (claude/whatsapp-robo-grupos-pelo-
   numero-da-igreja-08-10-2026.md, no Project).

   Mudar ministério, grupo ou horário é aqui. O segredo NÃO fica aqui: fica
   em .env, que o configurar.command cria e que nunca vai para o git. */

export const CONFIG = {
  /* o sistema, de onde o robô lê a escala pronta (/api/robo/grupos) */
  site: 'https://escalas.guiaservir.com',
  /* a versão que o robô conta ao sistema a cada passada */
  versao: '2026-10-26 9d',

  /* o número da igreja, em que o robô entra como aparelho conectado. Ligado
     a qualquer outro número, o robô não posta nada */
  numeroDaIgreja: '5521972976946',

  /* POR MINISTÉRIO (o nome é o do sistema: midia, louvor, servico...):
     linha do "Mandar nos grupos" (como o sistema chama) → grupo do WhatsApp
     (nome EXATO; nunca um parecido). Linha fora da tabela é pulada e avisada.
     · automatico: sai sozinho nas rodadas (só o principal);
     · grupoDaCobranca: onde vai a cobrança com @ (só no automático). */
  principal: 'midia',
  ministerios: {
    midia: {
      automatico: true,
      grupos: {
        'Grupo geral': 'Multimídia · Geral',
        'Multimídia · Projeção': 'Multimídia · Projeção',
        'Multimídia · Iluminação': 'Multimídia · Iluminação',
        'Multimídia · Edição': 'Multimídia · Edição',
        'Multimídia · Foto': 'Multimídia · Foto',
        'Multimídia · Filmagem e Câmeras': 'Multimídia · Filmagem e Câmeras',
        'Multimídia · Head': 'Multimídia · Head',
        'Multimídia · Transmissão': 'Multimídia · Transmissão',
      },
      grupoDaCobranca: 'Multimídia · Geral',
    },
    louvor: {
      automatico: false,
      grupos: {
        'Grupo geral': 'Louvor · Equipe',
        'Louvor · Banda': 'Louvor · Banda',
        'Louvor · Vocal': 'Louvor · Vocal',
        'Louvor · Dirigentes': 'Louvor · Dirigentes',
        'Louvor · Som e Palco': 'Louvor · Som e Palco',
      },
    },
    servico: {
      automatico: false,
      grupos: { 'Grupo geral': 'GUI> | CONNECT/DIACONIA' },
    },
  },

  /* as rodadas do dia (só do ministério automático), na hora de Brasília.
     · primeira: a escala de daqui a 2 dias sai pela primeira vez (qui → sábado, sex → domingo);
     · cobrar: cobra no geral quem ainda falta confirmar;
     · toda rodada repõe o grupo cuja escala mudou depois do envio e manda o que
       ficou para trás (Mac desligado na hora certa). */
  rodadas: [
    { hhmm: '09:00', primeira: false, cobrar: false },
    { hhmm: '12:00', primeira: false, cobrar: true },
    { hhmm: '19:58', primeira: true, cobrar: true },
  ],
  diasDeAntecedencia: 2,
  /* escala postada antes da hora (a pedido: o botão ou --mandar-agora): no
     automático, o robô continua repondo as trocas dela até esta distância; a
     cobrança segue na janela. É também o limite do pedido (o mesmo do sistema) */
  diasDeVigia: 14,

  /* uma rodada perdida (Mac dormindo) ainda roda até este atraso; depois, só a próxima */
  toleranciaMin: 90,
  /* rodada que não terminou (sem conexão, sistema fora) tenta de novo depois deste intervalo */
  retentarAposMin: 5,
  esperaConexaoS: 120,

  /* cobrança: só depois de a escala estar no grupo há algumas horas, e não
     mais de uma vez no mesmo intervalo (no máximo duas por dia) */
  cobrancaDepoisDaEscalaH: 6,
  cobrancaIntervaloMinimoH: 6,

  /* a mesma escala no mesmo grupo: no máximo esta quantidade de versões
     (a primeira e as trocas). Passou disso, o robô avisa e para de repor */
  maxVersoes: 4,

  /* entre uma mensagem e a próxima, como uma pessoa faria */
  intervaloEntreMensagensS: [15, 40],
  digitandoS: [2, 5],
  prazoDoEnvioS: 60,
  /* depois de cada envio, quanto esperar por um erro devolvido pelo WhatsApp */
  esperaRecusaS: 5,

  /* de quanto em quanto o robô passa no sistema para buscar os pedidos do
     botão e contar que está vivo (a tela chama de desligado depois de 3 min) */
  pedidosACadaS: 30,
};
