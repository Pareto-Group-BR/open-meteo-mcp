# Análise do Open-Meteo MCP para a Orla Rio

Relatório: [`diagnostico-open-meteo-mcp.md`](diagnostico-open-meteo-mcp.md). O código do servidor não foi alterado.

## Scripts (`scripts/`)

Pré-requisito: `npm ci && npm run build` na raiz. Executar da raiz do repositório.

| Script | O que faz | Precisa de rede externa |
|---|---|---|
| `01-ferramentas.mjs` | Lista as 17 ferramentas, parâmetros e variáveis dos Modos | Não |
| `02-comportamento-erros.mjs` | Erros de validação e falha de rede, via MCP | Não |
| `03-falhas-upstream-simulado.mjs` | Tratamento de nulo, 400, 401, 404, 429, 500 e 503 contra upstream local simulado | Não |
| `04-coleta-real.mjs` | Variáveis dos 4 Modos nos 5 pontos, hoje e amanhã; comparação de modelos e de `cell_selection` | Sim |
| `05-simulacao-verao.mjs` | Dias em Atenção/Alerta de dez/2025 a mar/2026 por Modo | Sim |
| `06-previsao-anterior.mjs` | Recuperação da previsão do dia anterior (Previous Runs API) | Sim |
| `07-tamanho-catalogo.mjs` | Tamanho do catálogo de ferramentas enviado ao agente | Não |
| `lib.mjs` | Pontos, limites dos Modos (não alterar) e função de classificação | — |

Saídas em `evidencias/`. Os scripts 04 a 06 falharam neste ambiente (política de rede); os arquivos `saida-*.txt` registram a falha.

## Reexecução com rede liberada

Liberar na política de rede do ambiente: `api.open-meteo.com`, `marine-api.open-meteo.com`, `archive-api.open-meteo.com`, `historical-forecast-api.open-meteo.com`, `previous-runs-api.open-meteo.com` e `open-meteo.com` (documentação).

```bash
export NODE_USE_ENV_PROXY=1
for s in 04-coleta-real 05-simulacao-verao 06-previsao-anterior; do node analise/scripts/$s.mjs; done
```
