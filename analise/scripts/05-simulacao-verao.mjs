// Simulação do verão passado (01/12/2025 a 31/03/2026): quantos dias teriam
// atingido Atenção e Alerta em cada Modo com os limites atuais.
// Método: previsão histórica (API historical-forecast, NÃO exposta pelo MCP) para
// calor/chuva/vento + marine_weather via MCP (start_date/end_date) para ondas.
// Requer rede. Saída: evidencias/simulacao-*.json e simulacao-resumo.md
import { classificar, conectarMcp, chamar, getJson, PONTOS, salvar, TZ } from './lib.mjs';

const INI = '2025-12-01';
const FIM = '2026-03-31';
const ATM = ['temperature_2m_max', 'apparent_temperature_max', 'uv_index_max', 'precipitation_sum', 'precipitation_probability_max', 'wind_gusts_10m_max'];
const MAR = ['wave_height_max', 'wave_period_max', 'wave_direction_dominant'];
const { client, fechar } = await conectarMcp();

const totais = {};
const notas = [];
for (const p of PONTOS) {
  const url = `https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&start_date=${INI}&end_date=${FIM}&daily=${ATM.join(',')}&timezone=${encodeURIComponent(TZ)}`;
  const atm = await getJson(url);
  const mar = await chamar(client, 'marine_weather', { latitude: p.latitude, longitude: p.longitude, start_date: INI, end_date: FIM, daily: MAR, timezone: TZ });
  if (!atm.json?.daily || !mar.json?.daily) {
    notas.push(`${p.nome}: falha (atm status ${atm.status}: ${atm.texto.slice(0, 120)}; mar: ${mar.texto.slice(0, 120)})`);
    continue;
  }
  const a = atm.json.daily, m = mar.json.daily;
  const cont = { dias: a.time.length, calor: { atencao: 0, alerta: 0 }, chuva: { atencao: 0, alerta: 0 }, vento: { atencao: 0, alerta: 0 }, ressaca: { atencao: 0, alerta: 0 }, nulos: { prob: 0, uv: 0, onda: 0, periodo: 0 } };
  a.time.forEach((_, i) => {
    const d = { tmax: a.temperature_2m_max[i], sensacao: a.apparent_temperature_max[i], uv: a.uv_index_max[i], prob: a.precipitation_probability_max[i], chuva: a.precipitation_sum[i], rajada: a.wind_gusts_10m_max[i], onda: m.wave_height_max?.[i], periodo: m.wave_period_max?.[i] };
    for (const k of ['prob', 'uv', 'onda', 'periodo']) if (d[k] === null || d[k] === undefined) cont.nulos[k]++;
    const n = classificar(d);
    for (const modo of ['calor', 'chuva', 'vento', 'ressaca']) {
      if (n[modo] === 'alerta') cont[modo].alerta++;
      else if (n[modo] === 'atencao') cont[modo].atencao++;
    }
  });
  totais[p.nome] = cont;
}
salvar('simulacao-bruto.json', { periodo: [INI, FIM], totais, notas });
const L = ['| Ponto | Dias | Calor Atenção | Calor Alerta | Chuva Atenção | Chuva Alerta | Vento Atenção | Vento Alerta | Ressaca Atenção* | Ressaca Alerta | Dias sem prob./UV/onda |', '|---|---|---|---|---|---|---|---|---|---|---|'];
for (const [n, c] of Object.entries(totais)) L.push(`| ${n} | ${c.dias} | ${c.calor.atencao} | ${c.calor.alerta} | ${c.chuva.atencao} | ${c.chuva.alerta} | ${c.vento.atencao} | ${c.vento.alerta} | ${c.ressaca.atencao} | ${c.ressaca.alerta} | ${c.nulos.prob}/${c.nulos.uv}/${c.nulos.onda} |`);
L.push('', '* Atenção da Ressaca sem filtro de direção (ainda não definida): é limite superior.', ...notas.map((x) => `- ${x}`));
salvar('simulacao-resumo.md', L.join('\n'));
console.log(L.join('\n'));
await fechar();
