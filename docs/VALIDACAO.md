# Registro de validação

## Módulo Guanambi — 25/11/2026

### O que mudou

- Nova rota `GET /api/guanambi`, que consulta em paralelo o Censo Escolar (IBGE Cidades, pesquisa 13) e as tabelas 9543 e 10056 do Censo 2022. Detalhes em [API.md](API.md).
- O cache e a validação passaram a ser compartilhados entre as rotas (`Sources/IBGECore/Cache.swift` e `validateAgregados`).
- O Worker do Cloudflare encaminha `/api/guanambi` ao Vapor e valida o contrato da resposta.
- A interface ganhou a seção "Guanambi em foco". O gráfico de linha passou para `public/chart.js` e é usado pelas duas seções.
- O CSV deixou de prefixar com apóstrofo o símbolo `-` do IBGE (valor nulo); a proteção contra fórmulas continua para os demais textos.

### Verificação

- `npm run check` (todos os arquivos JS de `public/`, `lib/` e o Worker) e `npm test`: **25 testes JavaScript** aprovados.
- `npm run test:swift`: **15 testes Swift** aprovados, com Swift 6.4 e `--build-system native`. Os 6 testes novos cobrem valores nulos e símbolos no Censo Escolar, indicadores e municípios inesperados, unidade e recortes do Censo 2022, contrato e cache da rota, erros 502/504 e falha de uma das três fontes.
- Testes HTTP com o servidor real em `127.0.0.1:3000` e consulta real às fontes:
  - `GET /api/guanambi`: 200, 9 indicadores do Censo Escolar (2008–2025), 18 recortes de alfabetização e 7 de frequência escolar. Primeira consulta em 0,54 s; segunda, do cache, em 6 ms.
  - `POST /api/guanambi`: 405 com `Allow: GET`.
  - `GET /api/indicadores`: 200.
  - O adaptador do Worker (`fetchSwiftGuanambi`) aceitou a resposta real do Vapor.
- Página verificada por captura de tela no Firefox headless (1280 px): cards, gráfico, tabela e barras comparativas exibidos com os dados reais.
- Layout conferido em celular real (pela rede local) e por captura em 390 px: cards e blocos empilhados, gráfico ajustado à largura e tabelas com rolagem horizontal.

### Limitações

- Imagem Docker, build de produção e deploy no Cloudflare continuam não validados.

## API Swift com Vapor — validação de 16/11/2026

### Resultado atual

- Backend Vapor 4 com `/api/indicadores`, `/health`, arquivos estáticos e cabeçalhos de segurança.
- Consulta ao IBGE, validação, cache de 15 minutos e compartilhamento de consultas em `Sources/IBGECore/`, usando um actor.
- O Worker consulta apenas `VAPOR_API_ORIGIN`, sem fallback para o IBGE.
- Os comandos npm de execução, compilação e testes, além do Dockerfile, usam `--build-system native`. Isso contorna a falha do sistema de build padrão do Swift 6.4, que estava compilando `swift-log` sem `-package-name`.
- O Dockerfile usa o `Package.resolved` para preservar as versões baixadas.

### Verificação

- `npm run check` e `npm test` aprovados; os 16 testes JavaScript passaram.
- Build completo de depuração do produto `App` aprovado com Swift 6.4 e `--build-system native` (237 segundos na primeira compilação).
- O executável compilado respondeu ao comando `--help`.
- Os **9 testes Swift** passaram no pacote completo: validação, concorrência/cache, expiração, nova tentativa, contrato HTTP/métodos/health/404 e erros 502/504. Os testes adicionais cobrem a integração padrão com o cliente HTTP do Vapor, URL/método/timeout, respostas inválidas e a disponibilidade de `/health` após falhas de rede. As rotas foram testadas com o transporte em memória do Vapor e consultas externas simuladas.
- O manifesto Swift e o núcleo Swift também haviam passado pela validação isolada.

Para executar novamente, use `npm run dev`. Não é necessário apagar `.build` ou baixar as dependências de novo. A opção nativa pode gerar um aviso de depreciação; a alternativa está documentada nas [notas oficiais do SwiftPM 6.4](https://docs.swift.org/latest/documentation/packagemanagerdocs/6.4/).

### Correção do encerramento durante a consulta

O log do usuário mostrou `Object ... of class _MultiHandle deallocated with non-zero retain count` e encerramento por SIGABRT após `GET /api/indicadores`. A implementação anterior criava e invalidava uma URLSession por consulta. Foi removido todo o uso de URLSession/FoundationNetworking do código da aplicação; a consulta agora usa o cliente HTTP do Vapor, mantido pela aplicação, com timeout de 20 segundos. Timeouts do AsyncHTTPClient retornam 504, e outras falhas retornam 502.

Após essa alteração, os 9 testes Swift e os 16 testes JavaScript passaram. O produto App foi recompilado. Os testes automatizados usam respostas simuladas. Posteriormente, o servidor real em `127.0.0.1:3000` ficou acessível e passou pelas verificações HTTP abaixo.

### Testes HTTP no servidor real — 16/11/2026, 15:17 (Bahia)

Com o servidor iniciado pelo usuário em `http://127.0.0.1:3000`:

- `GET /health`: 200, `status: "ok"` e `provider: "swift"`.
- `GET /api/indicadores`: 200, `provider: "swift"`, duas variáveis e 192 registros normalizados da Bahia, com oito períodos (2016–2019 e 2022–2025).
- `POST /api/indicadores`: 405, `Allow: GET`, JSON de erro e `Cache-Control: no-store`.
- `GET /api/inexistente`: 404.
- Segunda consulta de indicadores: 200, conteúdo e `fetchedAt` idênticos, confirmando reutilização do cache. O horário da consulta original foi `2026-11-16T18:13:12Z`; não foi forçada uma atualização do IBGE durante o teste.
- Cabeçalhos de segurança da resposta de indicadores iguais aos definidos no projeto.
- `GET /health` após as consultas: 200; o servidor permaneceu ativo.

### Limitações

Os comandos de verificação usaram os caches Swift/Clang em `/tmp` e `--disable-sandbox` para as restrições deste ambiente. Esses parâmetros não são necessários nos comandos npm normais do usuário.

A imagem Docker, o build de produção e o deploy não foram executados. Os testes HTTP reais usaram dados já presentes no cache do Vapor; não foi forçada uma nova chamada ao IBGE. Configure a origem HTTPS do servidor Vapor em `VAPOR_API_ORIGIN` antes de usar o proxy publicado no Cloudflare.
