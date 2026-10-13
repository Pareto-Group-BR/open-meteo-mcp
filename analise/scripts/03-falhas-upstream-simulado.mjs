// Testa o TRATAMENTO de falhas do MCP contra um upstream local SIMULADO.
// Atenção: isto NÃO é dado do Open-Meteo. Serve só para ver como o MCP repassa
// nulos, 400, 401, 404, 429, 500 e 503. Rótulo no relatório: "Código do
// repositório" (teste local com servidor simulado).
import { createServer } from 'node:http';
import { chamar, conectarMcp, salvar } from './lib.mjs';

const cenarios = {
  nulos: [200, { latitude: -22.97, longitude: -43.19, daily_units: { precipitation_probability_max: '%', uv_index_max: '' }, daily: { time: ['2026-10-13', '2026-10-14'], precipitation_probability_max: [null, null], uv_index_max: [11.2, null] } }],
  vazio: [200, { latitude: -22.97, longitude: -43.19 }],
  e400: [400, { error: true, reason: 'Cannot initialize WeatherVariable from invalid String value foo_bar.' }],
  e401: [401, { error: true, reason: 'Parameter apikey is invalid' }],
  e404: [404, { error: true, reason: 'Not found' }],
  e429: [429, { error: true, reason: 'Daily API request limit exceeded. Please try again tomorrow.' }],
  e500: [500, { error: true, reason: 'Internal error' }],
  e503: [503, 'Service Unavailable'],
};
const ordem = Object.keys(cenarios);
let atual = 0;

// O upstream devolve o cenário da vez; o laço abaixo avança um por chamada.
const srv = createServer((_req, res) => {
  const [status, corpo] = cenarios[ordem[atual]];
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}`;

const { client, fechar } = await conectarMcp({
  OPEN_METEO_API_URL: url,
  OPEN_METEO_CACHE_MAX_BYTES: '0',
});
const resultados = [];
for (atual = 0; atual < ordem.length; atual++) {
  const r = await chamar(client, 'weather_forecast', { latitude: -22.97, longitude: -43.19, daily: ['uv_index_max'], timezone: 'America/Sao_Paulo', forecast_days: 2 });
  resultados.push({ cenario: ordem[atual], status_upstream: cenarios[ordem[atual]][0], isError: r.isError, resposta: r.texto.slice(0, 400) });
  console.log(`${ordem[atual].padEnd(6)} upstream=${cenarios[ordem[atual]][0]} isError=${String(r.isError).padEnd(5)} ${r.texto.slice(0, 200)}`);
}
salvar('falhas-upstream-simulado.json', { aviso: 'Upstream local simulado; NÃO são dados do Open-Meteo.', resultados });
await fechar();
srv.close();
