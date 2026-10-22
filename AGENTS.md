# Meu Mimo

## Comece aqui

- Produto e aceite: [requisitos.md](requisitos.md).
- Decisões técnicas: [arquitetura.md](arquitetura.md).
- Interface e linguagem: [design.md](design.md).
- Entrada no projeto: [README.md](README.md) e [docs/onboarding.md](docs/onboarding.md).
- Ferramentas, fontes e evidências: [docs/setup.md](docs/setup.md).
- Qualidade, revisão e avaliação do agente: [docs/quality.md](docs/quality.md).

## Estado e comandos

A implementação atual está em `prototype/`: HTML, CSS e JavaScript ESM,
Node.js 24 e npm. `prototype/dist/` é código-fonte manual e deve ser versionado
e verificado. Next.js/React/TypeScript e PostgreSQL são propostas futuras;
Prisma foi escolhido para o acesso e as migrações do futuro banco.

Na raiz:

```sh
npm ci
npm run dev
npm run lint
npm run lint:rules
npm test
npm run check
```

O servidor atende em `http://127.0.0.1:4173`. Não há build nem typecheck
porque o protótipo não usa bundler ou TypeScript. Os comandos existentes de
`prototype/package.json` continuam válidos dentro daquela pasta.

## Acordos de trabalho

- Leia as instruções, o código relevante e o documento responsável antes de editar.
- Faça a menor mudança completa que atenda ao pedido; preserve alterações locais.
- Defina o aceite, reproduza falhas e execute os checks afetados antes de concluir.
- Preserve validação, tratamento de erros, acessibilidade e os sete testes de domínio.
- Separe comportamento implementado, decisão confirmada e proposta futura.
- Atualize o documento canônico junto com mudanças de contrato ou configuração.
- O estado em `localStorage`, os 240 pontos e as pessoas da prévia são demonstração.
  Não os trate como autenticação, autorização ou dados confiáveis de uma aplicação real.
- Preserve Prisma e os documentos existentes; a receita genérica de Drizzle do
  toolkit não substitui a decisão deste projeto.
- Mantenha credenciais, arquivos `.env`, backups e relatórios sensíveis fora do Git.
- Preserve o cliente, modelo, autenticação e permissões escolhidos pelo usuário.
  Este setup não altera a configuração global nem duplica o Context7.
- Responda em português com clareza e concisão; código e documentos usam prosa normal.
- Continue o trabalho autorizado após responder perguntas de status. Um bloqueio
  afeta suas dependências; ao retomar, confira arquivos, processos e checks reais.
- Use delegação somente quando autorizada e útil, com escopo explícito, um escritor
  por arquivo e revisão independente somente leitura. Verifique os resultados.
- Publicação, serviços pagos, migrações reais, mensagens externas e ações destrutivas
  dependem da autorização correspondente. Não instale hooks Git ou bloqueios de branch.

## Contexto e ferramentas

Use este arquivo como índice; carregue os documentos detalhados conforme a tarefa.
Consulte Context7 para APIs da versão usada quando a integração estiver carregada;
use documentação oficial e registre a limitação quando ela estiver indisponível.
Não envie código privado, dados pessoais ou segredos nas consultas.

Antes de depender de uma skill ou MCP, confirme sua descoberta no cliente.
O inventário de skills locais, os equivalentes de processo e as integrações
pendentes estão em `docs/setup.md`. Instalação em disco não prova ativação.
Revisões de UI devem incluir teclado, foco, estados, movimento reduzido e celular.
Não acrescente serviços ou dependências apenas para cumprir um catálogo.
