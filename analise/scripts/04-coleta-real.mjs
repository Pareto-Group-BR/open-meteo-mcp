// Chamadas REAIS ao Open-Meteo, pelo próprio MCP, para os 5 pontos da orla.
// Requer acesso de rede a api.open-meteo.com e marine-api.open-meteo.com.
// Saída: analise/evidencias/real-*.json e real-resumo.md
import { chamar, conectarMcp, PONTOS, salvar, TZ, classificar } from './lib.mjs';

const DIARIAS_ATM = ['temperature_2m_max', 'apparent_temperature_max', 'uv_index_max', 'precipitation_sum', 'precipitation_probability_max', 'wind_gusts_10m_max', 'wind_speed_10m_max'];
const DIARIAS_MAR = ['wave_height_max', 'wave_period_max', 'wave_direction_dominant', 'swell_wave_height_max', 'swell_wave_period_max', 'swell_wave_direction_dominant'];
const { client, fechar } = await conectarMcp();

// "Hoje" no dia civil de Brasília, calculado fora da API para conferência.
const hojeBR = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());
const amanhaBR = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(Date.now() + 864e5));
console.log(`Dia civil de Brasília agora: hoje=${hojeBR} amanhã=${amanhaBR}`);

const real = { gerado_em: new Date().toISOString(), hojeBR, amanhaBR, pontos: {} };
for (const p of PONTOS) {
  const base = { latitude: p.latitude, longitude: p.longitude, timezone: TZ, forecast_days: 2 };
  const atm = await chamar(client, 'weather_forecast', { ...base, daily: DIARIAS_ATM });
  const mar = await chamar(client, 'marine_weather', { ...base, daily: DIARIAS_MAR });
  const marHora = await chamar(client, 'marine_weather', { ...base, hourly: ['wave_height', 'wave_period', 'wave_direction', 'swell_wave_height', 'swell_wave_period', 'swell_wave_direction'] });
  real.pontos[p.nome] = { p, atm: atm.json ?? atm.texto, mar: mar.json ?? mar.texto, marHora: marHora.json ?? marHora.texto, ms: { atm: atm.ms, mar: mar.ms } };
  console.log(`${p.nome}: atm ${atm.ok ? 'ok' : 'ERRO'} (${atm.ms} ms) | mar ${mar.ok ? 'ok' : 'ERRO'} (${mar.ms} ms)`);
}

// Comparação de modelos no ponto central (Copacabana): qual preenche o quê.
const c = PONTOS[1];
real.modelos_atm = {};
for (const m of ['best_match', 'ecmwf_ifs025', 'ncep_gfs_seamless', 'icon_seamless', 'gem_seamless', 'meteofrance_seamless']) {
  const r = await chamar(client, 'weather_forecast', { latitude: c.latitude, longitude: c.longitude, timezone: TZ, forecast_days: 2, daily: DIARIAS_ATM, models: m });
  real.modelos_atm[m] = r.json?.daily ?? r.texto;
}
real.modelos_mar = {};
for (const m of ['best_match', 'ecmwf_wam025', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam']) {
  const r = await chamar(client, 'marine_weather', { latitude: c.latitude, longitude: c.longitude, timezone: TZ, forecast_days: 2, daily: DIARIAS_MAR, models: m });
  real.modelos_mar[m] = r.json?.daily ?? r.texto;
}
// Efeito da seleção de célula (terra x mar) no dado marítimo.
real.cell_selection = {};
for (const cs of ['land', 'sea', 'nearest']) {
  const r = await chamar(client, 'marine_weather', { latitude: c.latitude, longitude: c.longitude, timezone: TZ, forecast_days: 2, daily: DIARIAS_MAR, cell_selection: cs });
  real.cell_selection[cs] = r.json ?? r.texto;
}
salvar('real-bruto.json', real);

// Resumo legível + classificação dos Modos por ponto/dia.
const linhas = ['| Ponto | Dia | Tmax | Sens. | UV | Prob. | Chuva | Rajada | Vento | Onda | Per. | Dir. | Swell | Níveis |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
for (const [nome, v] of Object.entries(real.pontos)) {
  const a = v.atm?.daily, m = v.mar?.daily;
  if (!a || !m) { linhas.push(`| ${nome} | falha | | | | | | | | | | | | ${typeof v.atm === 'string' ? v.atm.slice(0, 60) : ''} |`); continue; }
  a.time.forEach((dia, i) => {
    const d = { tmax: a.temperature_2m_max?.[i], sensacao: a.apparent_temperature_max?.[i], uv: a.uv_index_max?.[i], prob: a.precipitation_probability_max?.[i], chuva: a.precipitation_sum?.[i], rajada: a.wind_gusts_10m_max?.[i], onda: m.wave_height_max?.[i], periodo: m.wave_period_max?.[i] };
    const n = classificar(d);
    linhas.push(`| ${nome} | ${dia} | ${d.tmax} | ${d.sensacao} | ${d.uv} | ${d.prob} | ${d.chuva} | ${d.rajada} | ${a.wind_speed_10m_max?.[i]} | ${d.onda} | ${d.periodo} | ${m.wave_direction_dominant?.[i]} | ${m.swell_wave_height_max?.[i]} | C:${n.calor} Ch:${n.chuva} V:${n.vento} R:${n.ressaca}${n.faltando.length ? ` (sem ${n.faltando.join(',')})` : ''} |`);
  });
}
salvar('real-resumo.md', linhas.join('\n'));
console.log(linhas.join('\n'));
await fechar();
