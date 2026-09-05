/* =============================================================================
   CONCORDÂNCIA DE NÚMERO

   Nasceu de uma varredura de 05/09/2026: 21 lugares do sistema mostravam um
   número variável ao lado de uma palavra escrita fixa. "1 funções sem ninguém
   que saiba fazer" e "2 furou" estavam no ar. Não é descuido de quem escreveu:
   em vários arquivos a linha CERTA está a três linhas da errada — escala/page
   trata furos no ramo do culto que já passou e esquece no ramo do que ainda
   vem. Repetir o ternário 21 vezes é repetir a chance de esquecer a 22ª.

   Duas funções porque são dois usos diferentes, e misturar os dois é como o
   número acaba duplicado ou sumido na frase:

     pl(n, 'quer', 'querem')            -> só a palavra, o número você escreve
     cont(n, 'função', 'funções')       -> "1 função" / "3 funções", já montado

   Zero conta como plural, que é o que o português faz: "0 vagas".
============================================================================= */

export function pl(n: number, um: string, varios: string) {
  return n === 1 ? um : varios;
}

export function cont(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}
