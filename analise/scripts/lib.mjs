// Utilitários compartilhados pelos scripts de diagnóstico.
// Não altera o servidor: usa o build em dist/ via stdio, como qualquer cliente MCP.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ = join(AQUI, '..', '..');
export const EVID = join(AQUI, '..', 'evidencias');
mkdirSync(EVID, { recursive: true });

export const TZ = 'America/Sao_Paulo';

// Pontos da orla (coordenadas do briefing; nenhum ajuste foi aplicado ainda).
export const PONTOS = [
  { nome: 'Leme', latitude: -22.9627, longitude: -43.17 },
  { nome: 'Copacabana', latitude: -22.9711, longitude: -43.1863 },
  { nome: 'Ipanema', latitude: -22.9868, longitude: -43.2051 },
  { nome: 'Barra da Tijuca', latitude: -23.0105, longitude: -43.365 },
  { nome: 'Recreio', latitude: -23.028, longitude: -43.46 },
];

// Limites iniciais do piloto (não alterar: definidos pela Orla Rio).
export const LIMITES = {
  calor: {
    atencao: { tmax: 35, sensacao: 38, uv: 11 }, // qualquer um (OU)
    alerta: { tmax: 38, sensacao: 42 }, // qualquer um (OU)
  },
  chuva: {
    atencao: { prob: 60, mm: 10 }, // ambos (E)
    alerta: { prob: 70, mm: 30 }, // ambos (E)
  },
  vento: { atencao: 40, alerta: 60 }, // rajada km/h
  ressaca: {
    atencao: { onda: 2, periodo: 10 }, // + direção A DEFINIR
    alerta: { onda: 2.5 },
  },
};

const ge = (v, lim) => v !== null && v !== undefined && v >= lim;

// Recebe valores diários e devolve 'normal' | 'atencao' | 'alerta' por Modo.
// Valor ausente (null) nunca dispara nível: o resultado traz `faltando`.
export function classificar(d) {
  const L = LIMITES;
  const faltando = [];
  const checa = (nome, v) => {
    if (v === null || v === undefined) faltando.push(nome);
  };
  for (const [k, v] of Object.entries(d)) checa(k, v);

  const calorAlerta = ge(d.tmax, L.calor.alerta.tmax) || ge(d.sensacao, L.calor.alerta.sensacao);
  const calorAtencao =
    ge(d.tmax, L.calor.atencao.tmax) ||
    ge(d.sensacao, L.calor.atencao.sensacao) ||
    ge(d.uv, L.calor.atencao.uv);
  const chuvaAlerta = ge(d.prob, L.chuva.alerta.prob) && ge(d.chuva, L.chuva.alerta.mm);
  const chuvaAtencao = ge(d.prob, L.chuva.atencao.prob) && ge(d.chuva, L.chuva.atencao.mm);
  const ventoAlerta = ge(d.rajada, L.vento.alerta);
  const ventoAtencao = ge(d.rajada, L.vento.atencao);
  const ressacaAlerta = ge(d.onda, L.ressaca.alerta.onda);
  // Direção ainda indefinida: a Atenção da Ressaca aqui ignora a direção
  // (limite superior de dias; ver relatório).
  const ressacaAtencao =
    ge(d.onda, L.ressaca.atencao.onda) && ge(d.periodo, L.ressaca.atencao.periodo);
  const nivel = (a, t) => (a ? 'alerta' : t ? 'atencao' : 'normal');
  return {
    calor: nivel(calorAlerta, calorAtencao),
    chuva: nivel(chuvaAlerta, chuvaAtencao),
    vento: nivel(ventoAlerta, ventoAtencao),
    ressaca: nivel(ressacaAlerta, ressacaAtencao),
    faltando,
  };
}

// O cliente stdio só repassa um ambiente mínimo; proxy e CA corporativos precisam
// ser repassados explicitamente para o servidor alcançar a internet.
function repassarRede() {
  const chaves = ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'NODE_USE_ENV_PROXY'];
  return Object.fromEntries(chaves.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
}

export async function conectarMcp(env = {}) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    cwd: RAIZ,
    stderr: 'pipe',
    env: { ...getDefaultEnvironment(), ...repassarRede(), TRANSPORT: 'stdio', ...env },
  });
  const stderrLinhas = [];
  transport.stderr?.on('data', (b) => stderrLinhas.push(String(b)));
  const client = new Client({ name: 'diagnostico-orla-rio', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  return { client, stderrLinhas, fechar: () => client.close() };
}

// Chama uma ferramenta e devolve { ok, ms, texto, json, isError }.
export async function chamar(client, name, args) {
  const t0 = Date.now();
  try {
    const r = await client.callTool({ name, arguments: args });
    const texto = r.content?.map((c) => c.text).join('') ?? '';
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {}
    return { ok: !r.isError, isError: !!r.isError, ms: Date.now() - t0, texto, json };
  } catch (e) {
    // Erros de validação do SDK (-32602) chegam como exceção.
    return { ok: false, isError: true, ms: Date.now() - t0, texto: String(e.message), json: null, excecao: true };
  }
}

export function salvar(nome, obj) {
  writeFileSync(join(EVID, nome), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

// GET direto (para APIs que o MCP não expõe). Respeita HTTPS_PROXY se
// NODE_USE_ENV_PROXY=1 estiver definido.
export async function getJson(url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    const texto = await r.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {}
    return { status: r.status, ms: Date.now() - t0, json, texto: texto.slice(0, 600) };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, json: null, texto: `${e.name}: ${e.message} ${e.cause?.message ?? ''}` };
  }
}
