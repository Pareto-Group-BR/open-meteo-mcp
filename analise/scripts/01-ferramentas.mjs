// Lista as ferramentas do MCP com parâmetros, padrões e tipos (não usa rede).
import { conectarMcp, salvar } from './lib.mjs';

const { client, fechar } = await conectarMcp();
const info = client.getServerVersion();
const instrucoes = client.getInstructions();
const { tools } = await client.listTools();

const resumo = tools.map((t) => {
  const props = t.inputSchema?.properties ?? {};
  return {
    name: t.name,
    title: t.title,
    required: t.inputSchema?.required ?? [],
    annotations: t.annotations,
    n_params: Object.keys(props).length,
    params: Object.fromEntries(
      Object.entries(props).map(([k, v]) => [
        k,
        {
          tipo: v.type ?? (v.anyOf ? 'união' : '?'),
          default: v.default,
          enum_ou_itens: v.enum ?? v.items?.enum ?? undefined,
          min: v.minimum,
          max: v.maximum,
        },
      ]),
    ),
  };
});

salvar('ferramentas.json', { servidor: info, instrucoes, ferramentas: resumo });
console.log(`servidor: ${info.name} ${info.version}; ${tools.length} ferramentas`);
for (const t of resumo) console.log(`- ${t.name}: ${t.n_params} parâmetros; obrigatórios: ${t.required.join(',') || '-'}`);

// Verificações específicas dos Modos.
const forecast = tools.find((t) => t.name === 'weather_forecast');
const marine = tools.find((t) => t.name === 'marine_weather');
const dailyF = forecast.inputSchema.properties.daily.items.enum;
const dailyM = marine.inputSchema.properties.daily.items.enum;
const hourlyF = JSON.stringify(forecast.inputSchema.properties.hourly);
const quer = {
  forecast: ['temperature_2m_max', 'apparent_temperature_max', 'uv_index_max', 'precipitation_sum', 'precipitation_probability_max', 'wind_gusts_10m_max', 'wind_speed_10m_max'],
  marine: ['wave_height_max', 'wave_period_max', 'wave_direction_dominant', 'swell_wave_height_max', 'swell_wave_period_max', 'swell_wave_direction_dominant'],
};
const verif = {
  weather_forecast_daily: Object.fromEntries(quer.forecast.map((v) => [v, dailyF.includes(v)])),
  marine_weather_daily: Object.fromEntries(quer.marine.map((v) => [v, dailyM.includes(v)])),
  defaults_relevantes: {
    forecast_days_forecast: forecast.inputSchema.properties.forecast_days,
    forecast_days_marine: marine.inputSchema.properties.forecast_days,
    timezone_forecast: forecast.inputSchema.properties.timezone,
    cell_selection_marine: marine.inputSchema.properties.cell_selection,
    models_marine: marine.inputSchema.properties.models?.enum,
    wind_speed_unit: forecast.inputSchema.properties.wind_speed_unit,
  },
  hourly_aceita_previous_day: /previous_day/.test(hourlyF),
  apikey_em_algum_schema: tools.some((t) => 'apikey' in (t.inputSchema?.properties ?? {})),
  ferramentas_com_strict: tools.filter((t) => t.inputSchema?.additionalProperties === false).length,
};
salvar('verificacao-schemas.json', verif);
console.log(JSON.stringify(verif.weather_forecast_daily));
console.log(JSON.stringify(verif.marine_weather_daily));
console.log('hourly aceita *_previous_day*:', verif.hourly_aceita_previous_day, '| apikey em schema:', verif.apikey_em_algum_schema);
await fechar();
