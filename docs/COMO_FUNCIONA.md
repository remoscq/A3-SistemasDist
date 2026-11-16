# Como funciona o projeto Bahia Educação

Documento da versão atual do projeto, atualizado em 16/11/2026.

## 1. Objetivo

O projeto apresenta dados de escolarização da Bahia obtidos do IBGE. A interface permite consultar períodos, grupos de idade e cor ou raça, visualizar indicadores, comparar dados em gráficos e exportar uma tabela em CSV.

A aplicação combina uma interface em HTML, CSS e JavaScript com um servidor escrito em Swift usando o framework Vapor. O servidor consulta o IBGE, valida a resposta e mantém um cache temporário dos resultados.

## 2. Como as partes se comunicam

Na execução local, o Vapor entrega os arquivos da interface e atende a API no mesmo endereço:

```text
Navegador
   │
   ├── GET /                  → Vapor entrega a página HTML
   ├── GET /app.js             → Vapor entrega o JavaScript
   ├── GET /styles.css         → Vapor entrega o CSS
   │
   └── GET /api/indicadores    → Vapor verifica o cache
                                   │
                                   ├── Cache válido: reutiliza os dados
                                   │
                                   └── Cache ausente ou vencido:
                                       consulta o IBGE, valida e guarda os dados
```

O resultado volta ao navegador em JSON. O JavaScript organiza os dados e atualiza os indicadores, os gráficos e a tabela.

## 3. O que acontece ao executar npm run dev

Na pasta do projeto:

```bash
npm run dev
```

Esse comando realiza duas etapas:

1. Compila o Tailwind CSS, transformando `src/styles.css` em `public/styles.css`.
2. Compila o Swift quando necessário e inicia o servidor Vapor em `http://127.0.0.1:3000`.

O npm organiza os comandos de desenvolvimento. Quem atende as requisições HTTP nessa execução é o Vapor. O processo permanece ativo enquanto o terminal estiver aberto; `Ctrl+C` encerra o servidor.

Os comandos Swift usam `--build-system native` para contornar a falha encontrada no sistema de build padrão do Swift 6.4, que estava compilando uma dependência sem a opção `-package-name`. Pode aparecer um aviso de depreciação dessa alternativa.

## 4. A interface

Os arquivos da interface estão na pasta `public/`:

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Estrutura da página e controles |
| `app.js` | Carregamento, interação, gráficos e atualização da tela |
| `data.js` | Validação e transformação dos dados, filtros e geração de CSV |
| `styles.css` | CSS gerado pelo Tailwind |
| `favicon.svg` | Ícone do site |

Ao abrir a página, o JavaScript chama `/api/indicadores`. Depois de carregar o conjunto de dados, os filtros de período, idade e cor ou raça são aplicados no navegador. Alterar um filtro não gera outra consulta ao IBGE.

A exportação CSV também é feita no navegador, usando os registros filtrados. Valores ausentes não são convertidos em zero. Se uma atualização falhar depois de a tela já ter carregado dados, os dados anteriores permanecem disponíveis com um aviso.

Para alterar o visual, edite `src/styles.css`. O arquivo `public/styles.css` é gerado pelo build.

## 5. O servidor Swift com Vapor

O servidor é uma aplicação HTTP que permanece em execução. As funções principais estão distribuídas assim:

| Arquivo | Responsabilidade |
| --- | --- |
| `Sources/App/entrypoint.swift` | Inicialização e encerramento da aplicação |
| `Sources/App/configure.swift` | Rotas, arquivos estáticos e cabeçalhos de segurança |
| `Sources/App/IBGEClient.swift` | Comunicação HTTP com o IBGE |
| `Sources/IBGECore/Indicators.swift` | Modelos Swift, validação, cache e concorrência |
| `Package.swift` | Definição do pacote e das dependências Swift |
| `Package.resolved` | Registro das versões resolvidas das dependências |

As rotas principais são:

| Requisição | Resposta esperada |
| --- | --- |
| `GET /` | Página do projeto |
| `GET /health` | HTTP 200, indicando que a aplicação está respondendo |
| `GET /api/indicadores` | HTTP 200 com os indicadores, quando a consulta funciona |
| Outro método em `/api/indicadores` | HTTP 405 com `Allow: GET` |
| Rota inexistente | HTTP 404 |

O endpoint `/health` verifica a disponibilidade da aplicação; ele não consulta o IBGE.

## 6. Consulta ao IBGE e resposta JSON

O servidor consulta uma URL fixa do IBGE com estes parâmetros:

- Tabela/agregado: **7139**.
- Unidade da Federação: **Bahia, código 29**.
- Períodos: solicitação dos dez últimos períodos disponíveis.
- Classificações: grupos de idade e cor ou raça.
- Variável `10276`: taxa de escolarização, em porcentagem.
- Variável `10277`: coeficiente de variação, em porcentagem.

O IBGE pode devolver menos períodos do que o número solicitado. Os grupos de idade podem se sobrepor e não devem ser somados.

O cliente HTTP do Vapor, baseado em AsyncHTTPClient/SwiftNIO, realiza a consulta com timeout de 20 segundos. A resposta precisa ter status 200 e corpo de até 5 MiB para ser aceita. Em seguida, o JSON é decodificado e os modelos são validados.

O contrato enviado ao navegador contém quatro campos:

| Campo | Significado |
| --- | --- |
| `variables` | Conjunto de variáveis e séries retornadas pelo IBGE |
| `fetchedAt` | Horário em que o servidor obteve os dados da fonte |
| `sourceUrl` | URL usada para consultar o IBGE |
| `provider` | Valor `swift`, identificando o backend |

## 7. Cache e consultas simultâneas

Os dados são armazenados na memória do processo Vapor por até **15 minutos**.

- A primeira requisição, sem cache, consulta o IBGE.
- Durante a validade do cache, as próximas requisições reutilizam o resultado.
- Após o vencimento, a próxima requisição faz uma nova consulta.
- Não existe atualização automática em segundo plano.
- Reiniciar o servidor apaga o cache.

O botão de atualizar da interface consulta novamente o Vapor, mas também respeita esse cache. Por isso, `fetchedAt` pode permanecer igual mesmo após clicar em atualizar.

Um `actor` Swift protege o estado do cache. Se várias requisições chegarem enquanto uma consulta estiver em andamento, elas aguardam o mesmo resultado, evitando chamadas externas duplicadas naquele processo.

O cache é individual por processo. Se a aplicação tiver várias instâncias, cada uma terá seu próprio cache. Não há banco de dados nem cache distribuído na implementação atual.

As respostas da API usam `Cache-Control: no-store`, pois o reaproveitamento dos dados é controlado pelo servidor Swift.

## 8. Erros e a correção do NetworkError

A implementação anterior usava `URLSession`. No ambiente Linux utilizado, o log mostrou uma falha em `_MultiHandle` seguida de SIGABRT. O processo Vapor encerrava, interrompendo a conexão antes de enviar uma resposta ao navegador. A interface então exibia `NetworkError`.

O código foi alterado para utilizar o cliente HTTP do Vapor. Esse cliente é mantido pela aplicação e encerrado junto com ela, sem criar e invalidar uma sessão de FoundationNetworking a cada consulta.

Os erros de consulta agora são tratados pela rota:

- **HTTP 502:** falha de comunicação ou resposta inesperada do IBGE.
- **HTTP 504:** timeout da consulta.

Uma falha não é substituída por dados fictícios nem por uma consulta alternativa em JavaScript.

## 9. Como o Cloudflare participa

As configurações da Vercel foram removidas. O projeto está preparado para usar **Cloudflare Workers com Static Assets** na publicação da interface.

Nesse modelo, o caminho é:

```text
Navegador → Cloudflare Worker → servidor Vapor → IBGE
```

O Worker entrega os arquivos de `public/` e encaminha `/api/indicadores` para o servidor Vapor. O endereço do backend é definido em `VAPOR_API_ORIGIN`, por exemplo:

```text
https://api.seu-dominio.com
```

Essa variável recebe somente a origem, sem o caminho `/api/indicadores`. Sem ela, a rota da API no Worker retorna HTTP 503. A configuração exige HTTPS em produção e permite HTTP apenas para origens locais.

| Arquivo | Responsabilidade |
| --- | --- |
| `wrangler.json` | Configuração do Worker e dos arquivos estáticos |
| `src/worker.js` | Roteamento e encaminhamento da API |
| `lib/swift.js` | Consulta e validação da resposta do servidor Vapor |
| `lib/headers.js` | Cabeçalhos de segurança usados pelo Worker |

Na arquitetura preparada, o servidor Vapor será publicado separadamente em um ambiente com suporte a Swift ou Docker. O comando de deploy do Worker publica a interface e o proxy; ele não publica o servidor Swift.

Na execução com `npm run dev`, o navegador acessa diretamente o Vapor. O Cloudflare não participa desse caminho local.

## 10. Segurança

O Vapor e o Worker aplicam cabeçalhos de segurança às respostas. A política CSP restringe as conexões da interface à mesma origem e, por padrão, permite incorporação em iframe apenas na mesma origem.

Para integrar a interface a outro portal, será necessário incluir a origem HTTPS autorizada na diretiva `frame-ancestors` da CSP, tanto no Vapor quanto no Worker.

A URL de consulta ao IBGE é fixa. O navegador não escolhe comandos, caminhos de arquivos ou destinos externos para o servidor consultar.

## 11. Como executar e testar

Na primeira instalação:

```bash
cd /home/ribeiro/Projetos/bahia-educacao
npm ci
swift package resolve
```

Para desenvolver:

```bash
npm run dev
```

Abra `http://127.0.0.1:3000` e mantenha o terminal aberto.

Para executar as verificações automatizadas:

```bash
npm run check
npm test
npm run test:swift
```

Com o servidor aberto, os testes HTTP podem ser repetidos em outro terminal:

```bash
curl -i http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/api/indicadores
curl -i -X POST http://127.0.0.1:3000/api/indicadores
curl -i http://127.0.0.1:3000/api/inexistente
```

As respostas esperadas são, respectivamente, 200, 200, 405 e 404, quando o IBGE ou o cache estiverem disponíveis para a consulta de indicadores.

Para testar o Worker local, mantenha o Vapor aberto e, em outro terminal na pasta do projeto, execute:

```bash
cp .dev.vars.example .dev.vars
npm run dev:cloudflare
```

O Worker normalmente estará disponível em `http://localhost:8787`.

## 12. Docker e situação da validação

O Dockerfile compila o CSS e o servidor Swift e inclui os arquivos da interface na imagem final. A aplicação é executada como usuário sem privilégios e usa a porta 8080:

```bash
docker build -t bahia-educacao .
docker run --rm -p 8080:8080 bahia-educacao
```

Até a elaboração deste documento:

- O servidor Vapor compilou com o build nativo.
- Os **9 testes Swift** e os **16 testes JavaScript** passaram.
- As rotas HTTP foram verificadas no servidor real em execução.
- A API retornou `provider: "swift"`, duas variáveis e **192 registros**.
- A repetição da consulta preservou o cache e o servidor continuou respondendo.
- Os testes HTTP usaram dados já presentes no cache; não foi forçada uma atualização do IBGE durante esses testes.
- O build Docker e a publicação em produção ainda não foram validados.

## 13. Referências

- [Documentação do cliente HTTP do Vapor](https://docs.vapor.codes/client/).
- [Notas do Swift Package Manager 6.4](https://docs.swift.org/latest/documentation/packagemanagerdocs/6.4/).
- [Cloudflare Workers: Static Assets e bindings](https://developers.cloudflare.com/workers/static-assets/binding/).
- `README.md` e `docs/VALIDACAO.md`, na pasta do projeto, com instruções e registros de verificação.
