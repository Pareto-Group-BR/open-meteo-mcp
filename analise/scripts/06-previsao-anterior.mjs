// A previsão "de ontem para hoje" é recuperável? Testa, com chamadas reais:
//  (a) a API Previous Model Runs (temperature_2m_previous_day1), que o MCP NÃO expõe;
//  (b) o que o MCP entrega com past_days=1 (que é a melhor estimativa, não a previsão antiga).
// Requer rede. Saída: evidencias/previsao-anterior.json
import { chamar, conectarMcp, getJson, PONTOS, salvar, TZ } from './lib.mjs';

const p = PONTOS[1];
const q = `latitude=${p.latitude}&longitude=${p.longitude}&timezone=${encodeURIComponent(TZ)}`;
const prev = await getJson(`https://previous-runs-api.open-meteo.com/v1/forecast?${q}&daily=temperature_2m_max,temperature_2m_max_previous_day1,wind_gusts_10m_max,wind_gusts_10m_max_previous_day1,precipitation_sum,precipitation_sum_previous_day1&past_days=3&forecast_days=2`);
const prevHorario = await getJson(`https://previous-runs-api.open-meteo.com/v1/forecast?${q}&hourly=temperature_2m,temperature_2m_previous_day1&past_days=1&forecast_days=1`);
const { client, fechar } = await conectarMcp();
const mcp = await chamar(client, 'weather_forecast', { latitude: p.latitude, longitude: p.longitude, timezone: TZ, past_days: 3, forecast_days: 2, daily: ['temperature_2m_max', 'wind_gusts_10m_max', 'precipitation_sum'] });
salvar('previsao-anterior.json', { previous_runs_diaria: prev, previous_runs_horaria_status: prevHorario.status, mcp_past_days: mcp.json ?? mcp.texto });
console.log('previous-runs (diária):', prev.status, JSON.stringify(prev.json?.daily ?? prev.texto).slice(0, 700));
console.log('MCP past_days:', mcp.ok ? JSON.stringify(mcp.json.daily).slice(0, 500) : mcp.texto);
await fechar();
