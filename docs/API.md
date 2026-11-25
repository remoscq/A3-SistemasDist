# APIs utilizadas e endpoints

Documento das APIs externas consultadas pelo módulo Bahia Educação e da API própria exposta pelo servidor Vapor. Atualizado em 25/11/2026.

Todas as fontes são públicas, gratuitas e não exigem chave de acesso. As consultas externas são feitas **somente pelo servidor Swift**, com URLs fixas; o navegador consulta apenas a API própria do projeto.

## 1. APIs externas

### 1.1 IBGE — API de agregados (v3), usada pelo SIDRA

Base: `https://servicodados.ibge.gov.br/api/v3/agregados`

Formato geral:

```text
GET /api/v3/agregados/{tabela}/periodos/{períodos}/variaveis/{variáveis}?localidades={níveis}&classificacao={recortes}
```

| Parâmetro | Significado | Exemplo |
| --- | --- | --- |
| `{tabela}` | Número da tabela (agregado) no SIDRA | `7139` |
| `{períodos}` | Ano(s) ou `-N` para os N últimos períodos | `-10`, `2022` |
| `{variáveis}` | Código da variável ou `all` | `2513` |
| `localidades` | Nível territorial e código, separados por `\|` | `N3[29]` (Bahia), `N6[2911709]` (Guanambi) |
| `classificacao` | Classificação e categorias, separadas por `\|` | `2[all]\|86[all]` |

Metadados de uma tabela (variáveis, classificações e níveis disponíveis): `GET /api/v3/agregados/{tabela}/metadados`.

A resposta é uma lista de variáveis; cada variável traz `resultados`, com as categorias de cada classificação e as séries por localidade:

```json
[{
  "id": "2513", "variavel": "Taxa de alfabetização das pessoas de 15 anos ou mais de idade", "unidade": "%",
  "resultados": [{
    "classificacoes": [{ "id": "2", "nome": "Sexo", "categoria": { "6794": "Total" } }, "..."],
    "series": [{ "localidade": { "id": "2911709", "nome": "Guanambi (BA)" }, "serie": { "2022": "88.16" } }]
  }]
}]
```

Os valores chegam como texto. Símbolos como `-`, `..`, `...` e `X` indicam valor indisponível ou sigiloso e são preservados, nunca convertidos em zero.

Tabelas consultadas:

| Tabela | Pesquisa | Variáveis | Recortes | Localidades |
| --- | --- | --- | --- | --- |
| [7139](https://sidra.ibge.gov.br/tabela/7139) | PNAD Contínua anual | `10276` taxa de escolarização (%), `10277` coeficiente de variação (%) | `58` grupo de idade, `86` cor ou raça | Bahia (`N3[29]`), 10 últimos períodos |
| [9543](https://sidra.ibge.gov.br/tabela/9543) | Censo Demográfico 2022 | `2513` taxa de alfabetização de 15 anos ou mais (%) | `2` sexo, `86` cor ou raça, `287` idade (somente total) | Guanambi e Bahia |
| [10056](https://sidra.ibge.gov.br/tabela/10056) | Censo Demográfico 2022 | `3795` taxa de frequência escolar bruta (%) | `58` grupo de idade (0–3, 4–5, 6–14, 15–17, 18–24, 25+), `2` e `86` somente total | Guanambi e Bahia |

URLs completas usadas pelo servidor: `IndicatorsService.sourceURL` em `Sources/IBGECore/Indicators.swift` e as constantes de `GuanambiService` em `Sources/IBGECore/Guanambi.swift`.

### 1.2 IBGE Cidades — API de pesquisas (v1), com dados do Censo Escolar do INEP

O INEP não oferece uma API REST para o Censo Escolar; os resultados por município são republicados pelo IBGE Cidades (pesquisa `13`, "Ensino").

Base: `https://servicodados.ibge.gov.br/api/v1/pesquisas`

```text
GET /api/v1/pesquisas/13/periodos/all/indicadores/{indicadores}/resultados/{município}
```

| Parâmetro | Significado | Exemplo |
| --- | --- | --- |
| `{indicadores}` | Códigos separados por `\|` | `5908\|5913` |
| `{município}` | Código IBGE de 7 dígitos | `2911709` |

Lista de indicadores da pesquisa: `GET /api/v1/pesquisas/13/indicadores/0`. Anos disponíveis: `GET /api/v1/pesquisas/13/periodos` (2008 a 2025 na data deste documento).

Indicadores usados:

| Medida | Educação infantil | Ensino fundamental | Ensino médio |
| --- | --- | --- | --- |
| Matrículas | `77881` | `5908` | `5913` |
| Docentes | `77887` | `5929` | `5934` |
| Escolas | `77893` | `5950` | `5955` |

Os indicadores agregadores (`5902` matrículas, `5923` docentes, `5944` escolas) não retornam valores; por isso são consultadas as etapas.

Resposta:

```json
[{ "id": 5908, "res": [{ "localidade": "291170", "res": { "2024": "11552", "2025": "11515" }, "notas": { "2025": null } }] }]
```

Observações:

- A localidade volta com 6 dígitos (`291170`), sem o dígito verificador.
- Valores podem vir como `null` ou como `-`.
- Docentes e escolas são contados em cada etapa em que atuam ou que oferecem; as etapas não devem ser somadas.

### 1.3 Códigos de localidade

| Localidade | Código | Consulta |
| --- | --- | --- |
| Bahia | `29` | `N3[29]` |
| Guanambi (BA) | `2911709` | `N6[2911709]` ou `/resultados/2911709` |

Confirmação do código: `GET https://servicodados.ibge.gov.br/api/v1/localidades/municipios/2911709`.

## 2. API própria (servidor Vapor)

Todas as rotas aceitam somente `GET`. Outros métodos em rotas da API retornam **405** com `Allow: GET`. As respostas da API usam `Cache-Control: no-store`; o reaproveitamento é feito pelo cache em memória do servidor (15 minutos).

| Rota | Função |
| --- | --- |
| `GET /api/indicadores` | Taxa de escolarização da Bahia (tabela 7139) |
| `GET /api/guanambi` | Censo Escolar e Censo 2022 de Guanambi, com a Bahia como comparação |
| `GET /health` | Verifica se o servidor responde; não consulta o IBGE |

### `GET /api/indicadores`

```json
{ "variables": [ /* resposta da tabela 7139, validada */ ], "fetchedAt": "2026-11-25T17:38:13Z", "sourceUrl": "https://servicodados.ibge.gov.br/…", "provider": "swift" }
```

### `GET /api/guanambi`

As três fontes são consultadas em paralelo. Se uma delas falhar, a rota inteira retorna erro; a seção da Bahia continua independente.

```json
{
  "municipalityId": "2911709",
  "censoEscolar": [ /* resposta da pesquisa 13, validada */ ],
  "alfabetizacao": [ /* resposta da tabela 9543, validada */ ],
  "frequenciaEscolar": [ /* resposta da tabela 10056, validada */ ],
  "fetchedAt": "2026-11-25T17:38:13Z",
  "sourceUrls": { "censoEscolar": "…", "alfabetizacao": "…", "frequenciaEscolar": "…" },
  "provider": "swift"
}
```

### Erros

| Status | Situação |
| --- | --- |
| 404 | Rota inexistente |
| 405 | Método diferente de `GET` em rota da API |
| 502 | Falha de comunicação, status diferente de 200, corpo acima de 5 MiB, JSON inválido ou dados fora do formato esperado |
| 504 | Timeout (20 segundos por consulta ao IBGE) |
| 503 | Somente no Worker do Cloudflare, quando `VAPOR_API_ORIGIN` não está configurada |

Corpo de erro: `{ "error": "mensagem" }`.

### Validação aplicada

- **Agregados (v3):** no máximo 100 variáveis; unidade `%` e uma única categoria por classificação esperada; anos com 4 dígitos; textos e valores com tamanho limitado.
- **Pesquisa 13 (v1):** somente os nove indicadores listados acima; localidade `291170` ou `2911709`; anos com 4 dígitos; valores `null` ou texto curto.
- O navegador repete a validação (`public/data.js` e `public/guanambi-data.js`) antes de exibir os dados.
