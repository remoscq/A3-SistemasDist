# Educação na Bahia

Módulo de Educação do **Bahia API Hub**. Reúne dados públicos de educação da Bahia e de **Guanambi**, o município de referência do projeto, com filtros, gráficos, tabelas e exportação CSV. Usa HTML, JavaScript e Tailwind CSS na interface e **Swift com Vapor 4** no servidor.

| Seção | Dados | Fonte |
| --- | --- | --- |
| Bahia | Taxa de escolarização por período, grupo de idade e cor ou raça | IBGE · PNAD Contínua (SIDRA 7139) |
| Guanambi | Matrículas, docentes e escolas por etapa de ensino, 2008–2025 | INEP · Censo Escolar, via IBGE Cidades |
| Guanambi × Bahia | Taxa de alfabetização (15 anos ou mais) e frequência escolar por idade | IBGE · Censo 2022 (SIDRA 9543 e 10056) |

O servidor consulta as fontes, valida as respostas e mantém os dados em cache por até 15 minutos.

## Executar localmente

Requisitos: **Swift 6.3+**, **Node.js 22.13+** e npm. A Toolbox Vapor é opcional.

```bash
npm ci
npm run dev
```

Abra **http://127.0.0.1:3000** e mantenha o terminal aberto. O comando compila o CSS e inicia o Vapor, que atende a interface e a API. A primeira compilação baixa as dependências Swift e pode demorar alguns minutos.

## API

| Rota | Função |
| --- | --- |
| `GET /api/indicadores` | Escolarização da Bahia, horário da consulta, URL da fonte e `provider: "swift"` |
| `GET /api/guanambi` | Censo Escolar e Censo 2022 de Guanambi, com a Bahia como comparação |
| `GET /health` | Verifica se o servidor está respondendo |

O botão de atualizar respeita o cache de 15 minutos. Falhas na consulta retornam HTTP 502; timeout retorna 504. Os endpoints externos, parâmetros e formatos de resposta estão em [docs/API.md](docs/API.md).

## Testes

```bash
npm run check
npm test
npm run test:swift
```

## Cloudflare

O Cloudflare Worker serve a interface e encaminha `/api/indicadores` e `/api/guanambi` para o Vapor. **O servidor Swift precisa ser hospedado separadamente**, com uma URL HTTPS.

Após publicar o Vapor, substitua a URL de exemplo pela origem real do servidor:

```bash
npx --yes wrangler@4 login
npm run deploy -- --var VAPOR_API_ORIGIN:https://api.seu-dominio.com
```

Para testar o Worker localmente, mantenha o Vapor aberto e execute em outro terminal:

```bash
cp .dev.vars.example .dev.vars
npm run dev:cloudflare
```

## Docker

Para executar a interface e a API no mesmo container:

```bash
docker build -t bahia-educacao .
docker run --rm -p 8080:8080 bahia-educacao
```

Abra **http://localhost:8080**.

## Documentação

- [APIs utilizadas e endpoints](docs/API.md)
- [Funcionamento e arquitetura](docs/COMO_FUNCIONA.md)
- [Resultados dos testes e limitações](docs/VALIDACAO.md)
