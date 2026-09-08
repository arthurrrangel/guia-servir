'use client';
import { useState } from 'react';
import Link from 'next/link';
import { MapaGuias } from './MapaGuias';
import { IcSeta } from './Icones';
import { PEQUENAS_GUIAS, wazeDaPequenaGuia, type PequenaGuia } from '@/lib/pequenas-guias';
import { IGREJA, canalDeConversa } from '@/lib/igreja';

/* =============================================================================
   A CIDADE — o mapa na home, e "o mais perto de mim"

   A pergunta de quem olha um mapa de grupos é uma só: qual fica perto de
   mim? O site pergunta a posição (só quando a pessoa toca no botão, nunca
   ao abrir), calcula a distância em linha reta até cada grupo com ponto e
   acende o mais perto — com a distância dita em km, o dia e a hora, e a
   ação certa (Waze onde há endereço público; conversa onde há só o bairro).
   A posição não sai do aparelho: não vai para servidor nenhum.

   Sem permissão, ou sem GPS: a frase diz isso e o mapa continua servindo.
   ============================================================================= */

function km(a: [number, number], b: [number, number]): number {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const fmtKm = (d: number) => d < 1 ? `${Math.round(d * 100) * 10} m` : `${d.toFixed(d < 10 ? 1 : 0).replace('.', ',')} km`;

type Achado = { grupo: PequenaGuia; dist: number };

export function Cidade() {
  const [foco, setFoco] = useState('');
  const [pessoa, setPessoa] = useState<[number, number] | null>(null);
  const [achado, setAchado] = useState<Achado | null>(null);
  const [estado, setEstado] = useState<'' | 'pedindo' | 'negado' | 'sem'>('');

  const comPonto = PEQUENAS_GUIAS.filter(g => g.coord);

  function acharPerto() {
    if (!('geolocation' in navigator)) { setEstado('sem'); return; }
    setEstado('pedindo');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const eu: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setPessoa(eu);
        let melhor: Achado | null = null;
        for (const g of comPonto) {
          const d = km(eu, g.coord as [number, number]);
          if (!melhor || d < melhor.dist) melhor = { grupo: g, dist: d };
        }
        setAchado(melhor); setEstado('');
        if (melhor) setFoco(melhor.grupo.nome);
      },
      err => { setEstado(err.code === 1 ? 'negado' : 'sem'); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }

  const g = achado?.grupo;
  const waze = g ? wazeDaPequenaGuia(g) : null;
  const conv = g ? canalDeConversa(`Oi! Vi o site da GUIA e quero ir na ${g.nome} (${g.dia}, ${g.hora}). Meu nome é: `) : null;

  return (
    <div className="cidade">
      <MapaGuias grupos={PEQUENAS_GUIAS} focoNome={foco} aoEscolher={setFoco} igreja pessoa={pessoa} />

      <div className="cidade-pe">
        {achado && g ? (
          <p className="cidade-achado" role="status">
            <span className="g-rot">O mais perto de você</span>
            <b>{g.nome}</b>
            <span className="cidade-achado-d">a {fmtKm(achado.dist)} · {g.dia}, {g.hora} · {g.bairro}</span>
          </p>
        ) : (
          <p className="cidade-achado" role="status">
            <span className="g-rot">{IGREJA.bairro} e arredores</span>
            <b>{comPonto.length} grupos na cidade</b>
            <span className="cidade-achado-d">
              {estado === 'pedindo' && 'Pedindo a sua posição…'}
              {estado === 'negado' && 'Sem a posição não dá para calcular. Toque num pino.'}
              {estado === 'sem' && 'Este aparelho não informa a posição. Toque num pino.'}
              {estado === '' && 'A posição fica no seu aparelho, e só é usada se você pedir.'}
            </span>
          </p>
        )}
        <div className="g-acoes">
          {achado && g ? (
            waze
              ? <a href={waze} target="_blank" rel="noreferrer" className="acao cheia">Ir de Waze <IcSeta /></a>
              : <a href={conv!.href} target="_blank" rel="noreferrer" className="acao cheia">Quero ir nessa <IcSeta /></a>
          ) : (
            <button type="button" className="acao cheia" onClick={acharPerto} disabled={estado === 'pedindo'}>
              Achar o mais perto de mim <IcSeta />
            </button>
          )}
          <Link href="/pequena-guia" className="g-link">Ver todos os grupos</Link>
        </div>
      </div>
    </div>
  );
}
