#!/usr/bin/env python3
"""Sabota cada correcao de uma migracao e EXIGE que a conferencia acuse.

Uma correcao cuja sabotagem passa despercebida nao esta testada: o teste
verde vira enfeite. Este arquivo e o que transforma "a conferencia passou"
em "a conferencia mede alguma coisa".

Uso: sabotar.py <numero> <modulo-de-casos.py>
O modulo precisa expor CASOS = [{'nome':..., 'sql':..., 'espera':...}].
"""
import glob, importlib.util, json, os, re, subprocess, sys, tempfile

N = sys.argv[1]
RAIZ = '/home/claude/escala-app'
S = '/tmp/claude-0/-home-claude/fb14e54a-4194-57dc-93b8-847061e827f9/scratchpad'
ARQ = glob.glob(f'{RAIZ}/supabase/{N}-*.sql')[0]
CONF = f'{S}/conf{N}.sql'

src = open(ARQ, encoding='utf-8').read()
i = src.index('do $conf$'); j = src.index('end $conf$;') + len('end $conf$;')
open(CONF, 'w', encoding='utf-8').write(src[i:j] + '\n')


def psql(*args, tx=False):
    cmd = ['psql', '-h', '/tmp', '-p', '5439', '-U', 'postgres', '-d', 'guia', '-q',
           '-v', 'ON_ERROR_STOP=1']
    if tx:
        cmd.append('--single-transaction')
    for a in args:
        cmd += ['-f', a]
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.stdout + p.stderr


def troca(fn, antes, depois, schema='public'):
    """Sabotagem por substituicao no corpo VIVO da funcao.

    O casamento e por espaco NORMALIZADO: `pg_get_functiondef` nao devolve o
    texto com a mesma indentacao que o arquivo, e casar caractere a caractere
    fez seis sabotagens silenciarem na primeira rodada. Uma sabotagem que nao
    casa e pior que sabotagem nenhuma, porque parece que a correcao esta
    testada. Por isso o `raise` quando nao casa.
    """
    # Espaco NENHUM conta: o pattern permite qualquer arranjo de espaco entre
    # dois caracteres quaisquer. Juntar por token nao basta, porque
    # `pg_get_functiondef` quebra linha dentro de `filter (` e o token vira
    # `(where` de um lado e `(` + `where` do outro. Isso silenciou duas
    # sabotagens antes de eu perceber.
    pat = r'\s*'.join(re.escape(c) for c in ''.join(antes.split()))
    return f"""do $sab$
declare src text; novo text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = {schema!r} and p.proname = {fn!r};
  novo := regexp_replace(src, $pat${pat}$pat$, $rep${depois}$rep$);
  if novo = src then
    raise exception 'SABOTAGEM NAO CASOU em {fn}: o trecho que ela quer estragar nao existe mais';
  end if;
  execute novo;
end $sab$;"""


spec = importlib.util.spec_from_file_location('casos', sys.argv[2])
mod = importlib.util.module_from_spec(spec)
mod.troca = troca
spec.loader.exec_module(mod)

# A restauracao entre um caso e o seguinte precisa reconstruir TODO o estado
# que a conferencia deste numero julga, e nao so o arquivo deste numero: a 85
# reescreve `dem_mover` inteira por cima da 84, entao restaurar so a 84
# deixaria o banco numa versao que nao existe em lugar nenhum. O modulo de
# casos diz quais arquivos, em ordem.
RESTAURA = [glob.glob(f'{RAIZ}/supabase/{n}-*.sql')[0] for n in getattr(mod, 'RESTAURA', [N])]

print(f'SABOTAGENS DA {N}\n')
falhas = 0
for c in mod.CASOS:
    sab = f'{S}/sab.sql'
    open(sab, 'w', encoding='utf-8').write(c['sql'] + '\n')
    out = psql(sab, CONF, tx=True)
    if f'{N} REPROVOU' in out:
        if c['espera'] in out:
            print(f"  ok   {c['nome']}")
        else:
            print(f"  FALHA {c['nome']} — reprovou, mas nao pelo caso certo")
            print(f"        esperava: {c['espera']}")
            for l in out.splitlines():
                if l.strip().startswith('-') or 'REPROVOU' in l:
                    print('        ' + l.strip())
            falhas += 1
    else:
        print(f"  FALHA {c['nome']} — A SABOTAGEM PASSOU. A conferencia nao testa isto.")
        for l in out.strip().splitlines()[-3:]:
            print('        ' + l.strip())
        falhas += 1
    psql(*RESTAURA)

open(f'{S}/nada.sql', 'w').write('select 1;\n')
out = psql(f'{S}/nada.sql', CONF, tx=True)
if f'{N} REPROVOU' in out:
    print('  FALHA controle negativo — a conferencia reprova SEM sabotagem nenhuma')
    falhas += 1
else:
    print('  ok   controle negativo: sem sabotagem, passa')

print()
if falhas:
    print(f'SABOTAGENS DA {N}: {falhas} falha(s).')
    sys.exit(1)
print(f'SABOTAGENS DA {N}: {len(mod.CASOS)}/{len(mod.CASOS)} acusadas, e o controle negativo passou.')
