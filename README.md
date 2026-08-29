# GUIA Servir

Sistema de escala de voluntários da **GUIA Church**. No ar em **[guiaservir.com](https://guiaservir.com)**.

Organiza quem serve em cada ministério (Mídia, Louvor, GUIA Kids, Connect, Livraria): cadastro pelo link do grupo, montagem de escala com sorteio que respeita nível e disponibilidade, confirmação pelo voluntário, e o espaço pessoal onde cada um vê a própria escala e avisa quando não pode.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Supabase** (Postgres + RLS + RPCs `SECURITY DEFINER`/invoker)
- Deploy na **Vercel**

## Nota sobre a chave no código

A chave `anon` do Supabase versionada em `lib/supabase.ts` é **pública por design** — ela já viaja no bundle do site e é protegida por Row Level Security no banco. As chaves sensíveis (service_role, segredo do cron) ficam em `.env.local`, fora do versionamento.

## Desenvolvimento

```bash
npm install
npm run dev
```
