// Mede o tamanho do catálogo de ferramentas (tools/list + instruções) que vai para o contexto do agente.
import { conectarMcp, salvar } from './lib.mjs';
const { client, fechar } = await conectarMcp();
const { tools } = await client.listTools();
const instr = client.getInstructions() ?? '';
const porTool = tools.map((t) => ({ name: t.name, bytes: JSON.stringify(t).length })).sort((a, b) => b.bytes - a.bytes);
const total = JSON.stringify(tools).length;
const r = { total_bytes_tools: total, tokens_aprox_4_chars_por_token: Math.round(total / 4), bytes_instrucoes: instr.length, por_ferramenta: porTool };
salvar('tamanho-catalogo.json', r);
console.log(JSON.stringify({ ...r, por_ferramenta: porTool.slice(0, 5) }, null, 1));
await fechar();
