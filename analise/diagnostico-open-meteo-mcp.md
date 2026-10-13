# Diagnóstico do Open-Meteo MCP para o Verão Perfeito 2026/27

Data: 13/10/2026. Versão analisada: `open-meteo-mcp-server` 2.5.2 (fork `Pareto-Group-BR/open-meteo-mcp`). O código do servidor não foi alterado.

**Limitação desta análise:** a política de rede do ambiente bloqueou todos os hosts do Open-Meteo (o proxy respondeu 403 ao `CONNECT`; ver [anexo](#9-anexo-técnico)). **Nenhum dado meteorológico real foi obtido.** Tudo que depende do dado (preenchimento, valores, variação entre pontos, simulação do verão, previsão do dia anterior) está marcado "não testado em chamada real". Os scripts para repetir esses testes estão prontos em `analise/scripts/` (ver `analise/README.md`).

**Legenda de origem**

| Marca | Significado |
|---|---|
| **Chamada real** | Execução real do MCP neste ambiente: catálogo de ferramentas, validação de parâmetros, servidor HTTP local, mensagens de erro. Não inclui dado meteorológico. |
| **Código do repositório** | Leitura do código, dos schemas e dos testes (230 testes passam, `npx vitest run`). Inclui o teste local com upstream simulado (script 03), que mostra o tratamento de falhas e não o dado do Open-Meteo. |
| **Documentação oficial** | Trechos das páginas oficiais do Open-Meteo obtidos por mecanismo de busca. As páginas não puderam ser abertas diretamente. |
| **Não confirmado** | Sem fonte verificável nesta sessão. Inclui preços e fontes secundárias. |

---

## 1. Resumo executivo

**Veredito: o MCP cobre, na estrutura, todas as informações dos quatro Modos no nível diário; a adoção em produção está bloqueada por licença comercial e pela falta de validação do dado real.**

- **Calor: viável.** Risco 1: UV diário pode vir vazio para o Rio (não testado). Risco 2: "sensação térmica" é o cálculo do Open-Meteo, não o índice de calor de órgãos brasileiros. Risco 3: licença comercial.
- **Chuva: viável com ressalva.** Risco 1: probabilidade de chuva pode vir vazia e o MCP repassa `null` como sucesso (o agente poderia classificar "normal" por engano). Risco 2: limite de probabilidade exige tratamento de ausência definido pela Orla Rio. Risco 3: licença comercial.
- **Vento: viável.** Risco 1: modelo atmosférico de resolução grosseira junto à costa (não testado). Risco 2: rajada vem de modelo, sem observação. Risco 3: licença comercial. A velocidade média máxima é só informativa.
- **Ressaca: viável só depois de uma decisão da Orla Rio.** Risco 1: direção das ondas indefinida (o MCP entrega graus; convenção "de onde vem" não confirmada). Risco 2: dado de onda em modelo de 8 a 25 km pode não representar a arrebentação de cada praia. Risco 3: período e altura máximos do dia podem ocorrer em horas diferentes.
- **Transversal:** a API gratuita é só para uso não comercial; o MCP não envia chave de API (o fork precisa mudar). A previsão "de ontem para hoje" não é recuperável pelo MCP; o agente deve guardar o resumo diário.
- **Operação:** o transporte HTTP funciona como serviço por URL (testado localmente), mas não há instância publicada; a autenticação é só por cabeçalho; o catálogo ocupa cerca de 27 mil tokens do agente.

---

## 2. Cobertura por Modo

**Critério da coluna Cobertura:** ✅ = entregue pronta no nível diário pelo MCP, sem risco conhecido além da validação em chamada real; 🟡 = entregue, com risco concreto ou decisão pendente; 🔴 = não atende. "Exposta pelo MCP" vem do código e foi confirmada no catálogo publicado pelo servidor (**Chamada real**, script 01). Parâmetros comuns a todas as chamadas: `latitude`, `longitude`, `timezone: "America/Sao_Paulo"`, `forecast_days: 2` (hoje e amanhã).

Estrutura esperada da resposta (sem valores, não é dado real):

```json
{"latitude":…,"longitude":…,"timezone":"America/Sao_Paulo",
 "daily_units":{"temperature_2m_max":"°C",…},
 "daily":{"time":["<hoje>","<amanhã>"],"temperature_2m_max":[x,y],…}}
```

### 2.1 Calor (ferramenta `weather_forecast`, bloco `daily`)

| Informação necessária | Variável no Open-Meteo | Exposta pelo MCP | Unidade | Cobertura | Como aparece (exemplo real) | Limitação ou ação necessária |
|---|---|---|---|---|---|---|
| Temperatura máxima | `temperature_2m_max` | Sim, diária (Chamada real) | °C (padrão `celsius`, Código) | ✅ | Não testado em chamada real | Máxima do dia civil local quando `timezone` é informado (Código) |
| Sensação térmica máxima | `apparent_temperature_max` | Sim, diária (Chamada real) | °C | ✅ | Não testado em chamada real | Definição do cálculo não confirmada (Não confirmado); validar se os 38 °C e 42 °C do piloto foram pensados para esse índice |
| Índice UV máximo | `uv_index_max` | Sim, diária (Chamada real) | índice (sem unidade) | 🟡 | Não testado em chamada real | Preenchimento para o Rio não verificado. Alternativa horária: `air_quality` com `uv_index` (calcular a máxima) |

**Decisão do Modo:** consegue ser decidido com este MCP, com 1 chamada por ponto. Condições: validar com dado real que UV vem preenchido; definir o que fazer se vier `null` (não disparar Atenção por UV, mas registrar "dado indisponível").

### 2.2 Chuva (`weather_forecast`, bloco `daily`)

| Informação necessária | Variável no Open-Meteo | Exposta pelo MCP | Unidade | Cobertura | Como aparece (exemplo real) | Limitação ou ação necessária |
|---|---|---|---|---|---|---|
| Probabilidade de chuva (máxima do dia) | `precipitation_probability_max` | Sim, diária (Chamada real) | % | 🟡 | Não testado em chamada real | Pode vir `null` para a região (Não confirmado). O MCP repassa `null` como sucesso, sem aviso (Código, script 03) |
| Precipitação total do dia | `precipitation_sum` | Sim, diária (Chamada real) | mm (padrão `mm`, Código) | ✅ | Não testado em chamada real | Soma do dia civil local. Modelo não resolve chuva convectiva localizada (Não confirmado) |

**Decisão do Modo:** só se a probabilidade vier preenchida. Ambos os critérios (probabilidade E milímetros) exigem os dois valores; com `null` na probabilidade o Modo nunca dispara. Alternativas em 7: decisão da Orla Rio (regra só por mm) ou cálculo de probabilidade a partir da ferramenta `ensemble_forecast`.

### 2.3 Vento (`weather_forecast`, bloco `daily`)

| Informação necessária | Variável no Open-Meteo | Exposta pelo MCP | Unidade | Cobertura | Como aparece (exemplo real) | Limitação ou ação necessária |
|---|---|---|---|---|---|---|
| Rajada máxima do dia | `wind_gusts_10m_max` | Sim, diária (Chamada real) | km/h (padrão `kmh`, Código) | ✅ | Não testado em chamada real | Medida a 10 m, de modelo; sem observação local |
| Velocidade máxima do vento | `wind_speed_10m_max` | Sim, diária (Chamada real) | km/h | ✅ | Não testado em chamada real | **Apenas informativa:** os limites de Atenção (40 km/h) e Alerta (60 km/h) usam só rajadas. Pode ser dispensada sem perda de regra |

**Decisão do Modo:** consegue ser decidido com este MCP. Condição: confirmar com dado real que as rajadas do modelo escolhido são plausíveis para a orla (resolução da grade).

### 2.4 Ressaca (ferramenta `marine_weather`, API Marine, bloco `daily`)

| Informação necessária | Variável no Open-Meteo | Exposta pelo MCP | Unidade | Cobertura | Como aparece (exemplo real) | Limitação ou ação necessária |
|---|---|---|---|---|---|---|
| Altura máxima das ondas | `wave_height_max` | Sim, diária (Chamada real) | m (padrão métrico, Não confirmado) | 🟡 | Não testado em chamada real | Grade de cerca de 8 a 25 km (Documentação oficial, via busca; modelo efetivo não testado): na costa a célula pode ser terra ou mar. O parâmetro `cell_selection` (`sea`/`land`/`nearest`) existe no MCP (Código) |
| Período | `wave_period_max` | Sim, diária (Chamada real) | s | 🟡 | Não testado em chamada real | É o máximo do dia, não o período na hora da maior onda. A regra "onda ≥ 2 m **e** período ≥ 10 s" pode disparar com valores de horas diferentes (Código: agregação diária é independente por variável). Exato só com dado horário |
| Direção dominante | `wave_direction_dominant` | Sim, diária (Chamada real) | graus (°), 0 a 360 | 🟡 | Não testado em chamada real | Convenção "de onde vem" ou "para onde vai" não confirmada. **Orla Rio precisa definir os setores** |
| Altura máxima do swell | `swell_wave_height_max` | Sim, diária (Chamada real) | m | 🟡 | Não testado em chamada real | Sem limite associado nos Modos: informativa. Também existem `swell_wave_period_max` e `swell_wave_direction_dominant` (Chamada real) |

**Decisão do Modo:** o MCP cobre a API Marine por completo (`https://marine-api.open-meteo.com/v1/marine`, Código), sem mudança no fork. Alerta (onda ≥ 2,5 m) pode ser decidido assim que o dado real for validado. Atenção depende da definição de direção e, para rigor, do cálculo horário do período.

---

## 3. Pontos transversais

| Tema | Situação | Origem |
|---|---|---|
| **Custo e licença da API** | API gratuita só para **uso não comercial**; uso comercial exige plano pago com chave de API. Dados sob CC BY 4.0, com atribuição | Documentação oficial (termos e preços) |
| Planos pagos | Standard: US$ 29/mês, 1 milhão de chamadas/mês. Professional: US$ 99/mês, 5 milhões/mês. Enterprise: 50 milhões ou mais, sob consulta. Cobrança fixa, sem excedente | **Não confirmado** (fontes secundárias e post do blog; página de preços não aberta) |
| Instância própria | Todas as 9 URLs de API são configuráveis por variável de ambiente (`OPEN_METEO_*_API_URL`); o README cita o Open-Meteo auto-hospedado. Custo e esforço de operar o dado de modelos não levantados | Código do repositório; esforço: Não confirmado |
| **Chave de API no MCP** | **Não suportada.** Nenhum schema aceita `apikey` (modo estrito rejeita: `Unrecognized key: "apikey"`). Plano pago exige mudança no fork | Chamada real (script 02) |
| Limites de uso (gratuito) | Menos de 10.000 chamadas/dia, 5.000/hora, 600/minuto; bloqueio de abuso sem aviso | Documentação oficial |
| Volume do projeto | 1 consulta diária (2 chamadas por ponto: atmosfera e mar; 10 chamadas para 5 pontos) + operadores. Pior caso sem cache: 300 perguntas × 2 chamadas = 600/dia. O MCP guarda respostas em memória (15 min previsão, 30 min mar), reduzindo o consumo. **Os limites técnicos não são o problema; a licença é** | Estimativa a partir de Código (cache) e Documentação oficial (limites) |
| Frequência de atualização | Atmosfera: modelos globais atualizam a cada 6 h (GFS 4×/dia; ECMWF IFS a cada 6 h, 9 km). Mar: a página de recursos cita atualização a cada 6 h; blog cita 2×/dia para o modelo global de 8 km. Atraso por modelo não confirmado | Documentação oficial (parcial, via busca); atraso: Não confirmado |
| Modelo que atende o Rio | `best_match` escolhe automaticamente; o modelo efetivo não vem na resposta. Comparação de modelos preparada no script 04 | Código; modelo efetivo: **não testado em chamada real** |
| Disponibilidade e SLA | Sem garantia de exatidão ou de disponibilidade ininterrupta no plano gratuito. SLA dos planos pagos não encontrado | Documentação oficial (gratuito); pagos: Não confirmado |
| **Comportamento em falha** | Ver tabela abaixo | Código do repositório (script 03, upstream simulado) e Chamada real (script 02) |
| **Transporte** | stdio (padrão) e Streamable HTTP em `/mcp` (`TRANSPORT=http`), sem estado. **Não há SSE legado** (`/sse` responde 404; `GET /mcp` responde 405). `GET /health` responde `{"status":"ok"}` | Chamada real (servidor HTTP local) |
| **Conector por URL** | Funciona como serviço por URL (inicialização, `tools/list` e `tools/call` respondem por POST). **Falta publicar:** não há instância no ar nem URL no repositório. Há `Dockerfile` (HTTP por padrão, `HOST=0.0.0.0`) e imagem `ghcr.io/cmer81/open-meteo-mcp` no `docker-compose.yml`; publicação do fork não verificada | Chamada real; Código |
| Autenticação | Chave única em `Authorization: Bearer` ou `X-API-Key`. **Sem chave na URL.** Sem `API_KEY` o servidor fica aberto. Se o Pareto Agents não permitir cabeçalhos no conector, a URL ficaria sem proteção | Código do repositório; suporte da plataforma: Não confirmado |
| Limite do próprio MCP | 60 requisições/min por IP; 600/min compartilhados para a faixa de saída da Anthropic (Cowork/claude.ai). Atrás de proxy, é preciso `TRUSTED_PROXIES` | Código do repositório |
| **Comparação com o dia anterior** | **Não recuperável pelo MCP.** `*_previous_day1` é rejeitado pelo schema; nenhum endpoint de Previous Runs ou Historical Forecast existe no cliente; `past_days` provavelmente devolve a melhor estimativa do passado, não a previsão feita ontem (Não confirmado, sem chamada real). Alternativa: o agente guarda o resumo diário | Chamada real (script 02); Código; Previous Runs API existe (Documentação oficial, via busca) |
| Tamanho do catálogo | `tools/list` = 106.570 bytes (≈ 27 mil tokens) para 17 ferramentas, das quais 7 são variações por modelo. Sem opção de ligar só algumas ferramentas | Chamada real (script 07) |
| Licença do código | MIT (linha de copyright sem titular preenchido) | Código do repositório |
| Dependências | `@modelcontextprotocol/sdk` 1.31.0, `axios` 1.20.0, `zod` 4.6.5, `express` 5.2.1, `lru-cache`, `dotenv`, `express-rate-limit`; Node 22 ou superior | Chamada real (`npm ls`) |
| Manutenção do projeto original | Última versão 2.5.2 em 03/10/2026; 87 commits desde 01/07/2026; praticamente um mantenedor (dois nomes de autor), além de dependabot e contribuições pontuais. Issues abertas do projeto original não consultadas (fora do escopo de acesso) | Código do repositório (histórico git local); issues: Não confirmado |

**Tratamento de falhas pelo MCP**

| Situação | O que o agente recebe | Observação |
|---|---|---|
| Parâmetro inválido (variável inexistente, `apikey`, `forecast_days` > 16, latitude fora do intervalo) | Erro MCP `-32602` com mensagem clara | Validação antes de chamar a API |
| Rede bloqueada ou sem DNS | `isError: true`, texto `Error: Failed to establish tunnel … 403` ou `getaddrinfo ENOTFOUND` | Chamada real. Sem nova tentativa |
| Valor nulo (variável sem dado para o local) | **Sucesso**, com `null` na série. O MCP não sinaliza | Teste com upstream simulado |
| Resposta sem o bloco `daily` | **Sucesso**, objeto sem a variável pedida | Teste com upstream simulado |
| HTTP 400 | `Invalid request parameters: <motivo da API>` | |
| HTTP 429 (limite) | `Open-Meteo rate limit reached. Please retry later.` (perde a distinção entre limite diário e por minuto) | |
| HTTP 500 ou 503 | `Open-Meteo server error (500/503): …` | Sem nova tentativa automática |
| HTTP 401 ou 404 | Texto genérico `Request failed with status code 401/404` | Chave de API inválida não seria explicada |

---

## 4. Variação entre pontos da orla

**Não testado em chamada real.** A tabela abaixo é o modelo que o script 04 preenche (`evidencias/real-resumo.md`). Nenhuma coordenada foi ajustada, pois não houve dado marítimo para avaliar se algum ponto cai em célula de terra.

| Ponto | Tmax (°C) | Sensação (°C) | UV | Prob. chuva (%) | Chuva (mm) | Rajada (km/h) | Onda (m) | Período (s) | Direção (°) |
|---|---|---|---|---|---|---|---|---|---|
| Leme | n/t | n/t | n/t | n/t | n/t | n/t | n/t | n/t | n/t |
| Copacabana | n/t | n/t | n/t | n/t | n/t | n/t | n/t | n/t | n/t |
| Ipanema | n/t | n/t | n/t | n/t | n/t | n/t | n/t | n/t | n/t |
| Barra da Tijuca | n/t | n/t | n/t | n/t | n/t | n/t | n/t | n/t | n/t |
| Recreio | n/t | n/t | n/t | n/t | n/t | n/t | n/t | n/t | n/t |

n/t = não testado em chamada real (hoje e amanhã).

Hipótese a verificar (**Não confirmado**): como as grades são de 8 a 25 km e os cinco pontos se estendem por cerca de 30 km, Leme, Copacabana e Ipanema tendem a cair na mesma célula e devolver valores idênticos; Barra e Recreio podem diferir. Se for confirmado, o Radar pode usar 2 ou 3 pontos em vez de 5, reduzindo chamadas.

---

## 5. Simulação do verão passado (dez/2025 a mar/2026)

**Não foi possível calcular.** Motivo: as APIs de histórico estavam bloqueadas pela política de rede (`archive-api`, `historical-forecast-api`, `marine-api`).

| Modo | Dias em Atenção | Dias em Alerta |
|---|---|---|
| Calor | não calculado | não calculado |
| Chuva | não calculado | não calculado |
| Vento | não calculado | não calculado |
| Ressaca | não calculado | não calculado |

**Método preparado (script 05, 121 dias por ponto):**

1. Calor, Chuva e Vento: API *Historical Forecast* (previsões arquivadas, a mais próxima do que o agente teria visto; **não exposta pelo MCP**, chamada direta). Alternativa pelo MCP: `weather_archive` (reanálise ERA5), que **não tem** `uv_index_max` nem `precipitation_probability_max` (Código: lista de variáveis diárias do arquivo), logo Chuva só poderia ser simulada por milímetros.
2. Ressaca: `marine_weather` com `start_date`/`end_date` (suportado, Código).
3. Os limites do piloto são aplicados sem alteração (`scripts/lib.mjs`). Atenção de Ressaca é calculada sem filtro de direção, portanto é um limite superior.
4. Limitações já conhecidas: o histórico de ondas é reanálise ou previsão arquivada, não observação; dias com probabilidade nula não contam para Chuva (o script informa quantos).

---

## 6. Unidades recomendadas

Cadastrar os parâmetros dos Modos nestas unidades (todas pedem `timezone: "America/Sao_Paulo"` e `forecast_days: 2`; janela = dia civil local, 00:00 a 24:00, valores do dia inteiro mesmo consultando às 9h):

| Parâmetro | Variável | Unidade | Agregação diária | Fuso |
|---|---|---|---|---|
| Temperatura máxima | `temperature_2m_max` | °C | Máxima do dia | America/Sao_Paulo |
| Sensação térmica máxima | `apparent_temperature_max` | °C | Máxima do dia | America/Sao_Paulo |
| Índice UV máximo | `uv_index_max` | índice | Máxima do dia | America/Sao_Paulo |
| Probabilidade de chuva | `precipitation_probability_max` | % | Máxima do dia | America/Sao_Paulo |
| Precipitação total | `precipitation_sum` | mm | Soma do dia | America/Sao_Paulo |
| Rajada máxima | `wind_gusts_10m_max` | km/h (`wind_speed_unit: "kmh"`, informar explicitamente) | Máxima do dia | America/Sao_Paulo |
| Velocidade máxima (informativa) | `wind_speed_10m_max` | km/h | Máxima do dia | America/Sao_Paulo |
| Altura máxima das ondas | `wave_height_max` | m | Máxima do dia | America/Sao_Paulo |
| Período | `wave_period_max` | s | Máxima do dia (ou valor horário na hora da maior onda) | America/Sao_Paulo |
| Direção das ondas | `wave_direction_dominant` | graus (0 a 360) | Dominante do dia | America/Sao_Paulo |
| Altura máxima do swell (informativa) | `swell_wave_height_max` | m | Máxima do dia | America/Sao_Paulo |

Usar fuso fixo em vez de `auto`: o resultado não muda com a localização informada. As unidades padrão (`celsius`, `mm`, `kmh`) vêm do schema; passá-las explicitamente evita surpresa se o padrão mudar.

---

## 7. Lacunas e opções

| # | Lacuna | Opções (esforço) | Recomendação |
|---|---|---|---|
| 1 | **Uso comercial não permitido na API gratuita; MCP sem chave de API** | (a) Plano pago + fork que envia `apikey` e usa a URL de cliente (baixo a médio); (b) instância própria do Open-Meteo (alto); (c) fonte complementar comercial (médio); (d) decisão da Orla Rio sobre risco de seguir no gratuito (baixo, não recomendado) | (a), após confirmar preço e termos com o Open-Meteo |
| 2 | Dado real nunca validado (preenchimento, valores, pontos, modelo, ondas costeiras) | Liberar a rede e rodar scripts 04 a 06 (baixo) | Fazer antes de qualquer decisão |
| 3 | Probabilidade de chuva possivelmente vazia | Calcular a partir de `ensemble_forecast` (fração de membros acima do limite; médio); Orla Rio aceitar regra só por mm (baixo); outro modelo ou fonte (médio) | Validar primeiro (lacuna 2); se vazia, decisão da Orla Rio + ensemble |
| 4 | Previsão do dia anterior indisponível | Agente grava o resumo diário e o nível de cada Modo (baixo; também resolve "voltou ao normal"); fork com endpoint Previous Runs (médio) | Gravar o resumo no agente |
| 5 | Período e altura de ondas não coincidentes no dia | Calcular no agente a partir de `hourly` (baixo); ferramenta nova no fork que devolva o Modo calculado (médio) | Calcular a partir de dados por hora |
| 6 | Direção da Ressaca indefinida; convenção do dado não confirmada | Decisão da Orla Rio (setores em graus); confirmar convenção na documentação ou com dados reais (baixo) | Decidir antes do piloto |
| 7 | Uma localização por chamada (5 pontos = 10 chamadas) | Reduzir para 2 ou 3 pontos se o dado for igual (baixo); fork aceitando lista de coordenadas, se a API permitir (médio; suporte da API a várias coordenadas não confirmado nesta sessão) | Reduzir pontos após a lacuna 2 |
| 8 | Catálogo de 27 mil tokens por agente | Fork com variável que liste só as ferramentas necessárias (baixo) | Fazer: o agente só precisa de 3 ferramentas (`weather_forecast`, `marine_weather`, `ensemble_forecast`) |
| 9 | Autenticação só por cabeçalho | Confirmar que o Pareto Agents e o Cowork enviam cabeçalho no conector (baixo); senão, fork com chave na URL (baixo a médio) | Confirmar com a plataforma |
| 10 | Falhas silenciosas (`null`, ausência de `daily`, 401/404 genéricos, sem nova tentativa) | O agente valida cada variável e trata `null` como "indisponível" (baixo); fork com aviso e nova tentativa em 429 e 5xx (baixo) | Validação no agente; fork opcional |
| 11 | Sem instância publicada | Subir a imagem Docker em hospedagem própria com `API_KEY`, `HOST=0.0.0.0` e `TRUSTED_PROXIES` (baixo) | Fazer junto com a lacuna 1 |
| 12 | Célula marítima pode cair em terra | Testar `cell_selection` e ajustar coordenadas (baixo) | Fazer na lacuna 2 |

---

## 8. Perguntas em aberto para a Orla Rio

1. **Direção das ondas na Ressaca:** quais setores (em graus) caracterizam a condição? O MCP entrega graus de 0 a 360 do swell ou das ondas combinadas. A Orla Rio escolhe qual dos dois usar e se o setor vale para todas as praias.
2. **Uso comercial e custo:** o projeto aceita pagar plano comercial do Open-Meteo (ordem de US$ 29 a US$ 99 por mês, a confirmar)? Ou prefere instância própria ou outra fonte?
3. **Probabilidade de chuva ausente:** se vier vazia, o Modo Chuva deve usar só os milímetros, ficar "indisponível" ou usar outra fonte?
4. **Pontos de decisão:** o Modo vale para a orla inteira ou por praia? Se um ponto atinge Alerta e outro não, vale o mais severo?
5. **Período na Ressaca:** o período de 10 s precisa ocorrer na mesma hora da onda de 2 m?
6. **Sensação térmica:** aceita o cálculo do Open-Meteo para os limites de 38 °C e 42 °C?
7. **Velocidade do vento:** fica fora da regra (apenas informativa)?
8. **Dado indisponível:** o operador deve receber aviso quando faltar dado, ou o agente fica em silêncio?
9. **Atribuição:** como creditar o Open-Meteo nas mensagens de WhatsApp (exigência da licença CC BY 4.0)?
10. **Limites do piloto:** revisar após a simulação do verão passado (seção 5), quando houver rede.

---

## 9. Anexo técnico

### 9.1 Ferramentas do MCP (17)

Todas somente leitura, parâmetros em modo estrito, resposta em JSON compacto dentro de `content[0].text` (cortada em 25.000 caracteres, com `truncated: true`). Fonte: **Chamada real** (`evidencias/ferramentas.json`).

| Ferramenta | Endpoint | Parâmetros | Observação |
|---|---|---|---|
| `weather_forecast` | `api.open-meteo.com/v1/forecast` | 24 | Padrão do projeto. `forecast_days` 1 a 16; `past_days` 1 a 92; `timezone` texto livre; padrões `celsius`, `kmh`, `mm`, `iso8601` |
| `marine_weather` | `marine-api.open-meteo.com/v1/marine` | 17 | `forecast_days` 0 a 16; `cell_selection`; modelos: `best_match`, `meteofrance_wave`, `ecmwf_wam025`, `ncep_gfswave025`, `dwd_gwam`, `era5_ocean` e outros |
| `weather_archive` | `archive-api…/v1/archive` | 16 | Reanálise ERA5; sem UV nem probabilidade |
| `air_quality` | `air-quality-api…/v1/air-quality` | 11 | Inclui `uv_index` horário |
| `ensemble_forecast` | `ensemble-api…/v1/ensemble` | 21 | `models` obrigatório |
| `seasonal_forecast`, `climate_projection`, `flood_forecast` | endpoints próprios | 17, 13, 12 | Fora do escopo dos Modos |
| `elevation`, `geocoding` | `/v1/elevation`, `geocoding-api…/v1/search` | 2, 5 | |
| `dwd_icon_forecast`, `gfs_forecast`, `meteofrance_forecast`, `ecmwf_forecast`, `jma_forecast`, `metno_forecast`, `gem_forecast` | `/v1/dwd-icon`, `/v1/gfs`, … | 24 cada | Mesmo schema do `weather_forecast`, um modelo por chamada |

### 9.2 Chamadas recomendadas (por ponto)

```json
{"name":"weather_forecast","arguments":{"latitude":-22.9711,"longitude":-43.1863,
 "timezone":"America/Sao_Paulo","forecast_days":2,
 "daily":["temperature_2m_max","apparent_temperature_max","uv_index_max","precipitation_sum",
          "precipitation_probability_max","wind_gusts_10m_max","wind_speed_10m_max"]}}
```

```json
{"name":"marine_weather","arguments":{"latitude":-22.9711,"longitude":-43.1863,
 "timezone":"America/Sao_Paulo","forecast_days":2,
 "daily":["wave_height_max","wave_period_max","wave_direction_dominant",
          "swell_wave_height_max","swell_wave_period_max","swell_wave_direction_dominant"]}}
```

### 9.3 Respostas reais observadas (falhas de rede)

```text
weather_forecast → isError=true  "Error: Failed to establish tunnel to api.open-meteo.com:443 via http://127.0.0.1:<porta>: HTTP/1.1 403 Forbidden"
marine_weather   → isError=true  "Error: Failed to establish tunnel to marine-api.open-meteo.com:443 … HTTP/1.1 403 Forbidden"
daily=["wave_height_max"] em weather_forecast → -32602 "Invalid option: expected one of …"
apikey                    → -32602 "Unrecognized key: \"apikey\""
temperature_2m_previous_day1 → -32602 "Unknown variable: use one of the listed surface variables …"
forecast_days=17          → -32602 "Too big: expected number to be <=16 at forecast_days"
```

Servidor HTTP local (porta 3456, sem `API_KEY`): `GET /health` → `{"status":"ok"}`; `POST /mcp` `initialize` → `protocolVersion 2025-06-18`, `serverInfo open-meteo-mcp-server 2.5.2`; `GET /mcp` → 405; `/sse` → 404.

### 9.4 Versões

Servidor 2.5.2 (commit `7a7f4f9`); Node 22.22.0; SDK MCP 1.31.0; axios 1.20.0; zod 4.6.5; 230 testes passando.

### 9.5 Arquivos de evidência (`analise/evidencias/`)

`ferramentas.json`, `verificacao-schemas.json`, `comportamento-erros.json`, `falhas-upstream-simulado.json` (**dados simulados, não são do Open-Meteo**), `tamanho-catalogo.json`, `saida-04/05/06-*.txt` (falha de rede registrada).

### 9.6 Links consultados (via busca; páginas não abertas diretamente)

- Termos e privacidade: https://open-meteo.com/en/terms
- Preços: https://open-meteo.com/en/pricing
- Assinaturas comerciais (blog): https://openmeteo.substack.com/p/api-subscriptions-for-commercial
- API Marine: https://open-meteo.com/en/docs/marine-weather-api
- Previous Model Runs API: https://open-meteo.com/en/docs/previous-runs-api
- Historical Forecast API: https://open-meteo.com/en/docs/historical-forecast-api
- Atualização de modelos: https://open-meteo.com/en/docs/model-updates
- Projeto original do MCP: https://github.com/cmer81/open-meteo-mcp

### 9.7 Como repetir os testes com rede

Ver `analise/README.md`. Hosts a liberar: `api`, `marine-api`, `archive-api`, `historical-forecast-api`, `previous-runs-api` e `open-meteo.com`.
