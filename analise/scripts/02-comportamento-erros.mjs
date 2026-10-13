// Comportamento do MCP em erro de validação e em falha de rede (funciona sem rede).
import { chamar, conectarMcp, PONTOS, salvar, TZ } from './lib.mjs';

const p = PONTOS[1]; // Copacabana
const base = { latitude: p.latitude, longitude: p.longitude, timezone: TZ };
const casos = [
  ['chamada válida (resultado depende da rede)', 'weather_forecast', { ...base, daily: ['temperature_2m_max'], forecast_days: 2 }],
  ['variável diária inexistente', 'weather_forecast', { ...base, daily: ['wave_height_max'] }],
  ['parâmetro desconhecido: apikey (modo strict)', 'weather_forecast', { ...base, daily: ['temperature_2m_max'], apikey: 'x' }],
  ['previous_day1 em hourly', 'weather_forecast', { ...base, hourly: ['temperature_2m_previous_day1'] }],
  ['forecast_days acima do máximo', 'weather_forecast', { ...base, daily: ['temperature_2m_max'], forecast_days: 17 }],
  ['latitude fora do intervalo', 'marine_weather', { latitude: 95, longitude: 0 }],
  ['marine: chamada válida (resultado depende da rede)', 'marine_weather', { latitude: p.latitude, longitude: p.longitude, daily: ['wave_height_max'], timezone: TZ, forecast_days: 2 }],
];

const { client, stderrLinhas, fechar } = await conectarMcp();
const saida = [];
for (const [rotulo, tool, args] of casos) {
  const r = await chamar(client, tool, args);
  saida.push({ rotulo, tool, args, isError: r.isError, excecao: !!r.excecao, ms: r.ms, resposta: r.texto.slice(0, 700) });
  console.log(`\n# ${rotulo}\n  isError=${r.isError} (${r.ms} ms)\n  ${r.texto.slice(0, 300).replace(/\n/g, ' ')}`);
}
salvar('comportamento-erros.json', saida);
salvar('stderr-servidor.log', stderrLinhas.join(''));
await fechar();
