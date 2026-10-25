# Plano — Minha conta e Notificações no desktop

**Objetivo:** organizar perfil, segurança e preferências, e facilitar a consulta
de novidades com o visual atual. Execução sequencial neste checkout.

**Arquitetura:** apresentação autenticada própria sob AccountPanel; preservar
o controlador, chaves de sessão e APIs. Central usa os recursos/ações existentes.
CSS modular e assets locais, React 19.3.1/Next 16.4.2, sem dependências novas.

**Direção:** [documento](../specs/2026-10-24-desktop-conta-notificacoes-design.md).

## Etapas

- [x] Ler componentes, testes e contratos; conferir checkout limpo e parar web.
- [x] Registrar direção e limites, com decisões de implementação identificadas.
- [x] Capturar baseline e acrescentar verificações de geometria, estados e foco.
- [x] Separar AccountWelcome e apresentação autenticada, organizar perfil/MFA/
  preferências/saída sem mudar os fluxos de sessão.
- [x] Organizar NotificationCenter/cartões/filtros e preferências com CSS isolado.
- [x] Executar checks, testes de conta/contexto/novidades/preferências e regressões
  compartilhadas; integração focal real de perfil/MFA/notificações.
- [x] Revisão independente somente leitura, correções e capturas inspecionadas.
- [x] Registrar evidências, atualizar design.md e retomar local:web/health.

## Riscos a conferir

- Revalidação e logout não podem revelar/remontar perfil antigo.
- Recuperação restrita continua sem árvore privada.
- Leitura usa versão observada, sem marcar eventos posteriores ou bilhetes.
- Filtro/erro/paginação não podem mostrar totais falsos nem roubar foco.
- Preferências mantêm rascunho/intenção incerta e alvo de checkbox com rótulo.

Diretrizes Web Interface Guidelines consultadas em 24/10. APIs React de refs/
foco já consultadas via Context7 (19.3.0 e react.dev; sem patch 19.3.1 no catálogo).
Artefatos em `.artifacts/` ignorados. Após a implementação, o usuário solicitou
commit e push das melhorias em 25/10.

## Evidências

- Baseline: 4 falhas esperadas de geometria em 320/390 com viewport desktop;
  capturas anteriores inspecionadas e preservadas. A conta empilhava perfil,
  preferências, saída e MFA; a central empilhava filtros antes da lista.
  Log `desktop-conta-notificacoes-baseline.log`.
- A revisão independente identificou dois P2: o contador da consulta filtrada
  era apresentado como global e a leitura lenta roubava foco de outro controle.
  Acrescentados testes e ajustado o mock para reproduzir o escopo real do contador
  por loja. Rodada RED: 6 falhas e 8 aprovações, incluindo a disposição do perfil
  ainda alta (`desktop-conta-notificacoes-review-red.log`).
- Contador global passou a usar a consulta pequena sem filtros, sob o mesmo
  coordenador de sessão. A lista mantém total/filtros próprios. Foco após leitura
  depende do acionador ainda focado. Perfil perde a borda/margem herdada do cartão
  antigo e usa dois campos em paralelo no desktop. Revisão estática das correções
  concluída sem novos achados; APIs, contratos e permissões preservados.
- Check completo aprovado (`desktop-conta-notificacoes-check-green.log`): regras,
  lint, sete testes de domínio, TypeScript, 64 testes web e build. O TypeScript
  havia recusado uma condição JSX com erro `unknown`; foi usada condição
  explícita antes da rodada aprovada. Lint dos arquivos afetados também passou.
- Regressão ampliada: 203/204 aprovados em 320/390, incluindo conta, contexto,
  novidades, preferências e áreas que compartilham os recursos de relação
  (`desktop-conta-notificacoes-ui.log`). O timeout isolado do bilhete em 390
  ocorreu no carregamento: trace mostrava chunks sem conclusão e nenhum GET
  de sessão, com tela em “Conferindo sua conta…”. Não foi alterado seu timeout
  nem o código de bilhetes.
- Repetição dos 18 casos novos e de todo o arquivo de bilhetes: 40/40 aprovados
  no build final, sem skips (`desktop-conta-notificacoes-ui-focal.log`). O caso
  do timeout passou nos dois projetos. A cobertura distinta de 204 casos foi
  verificada pela combinação dessas rodadas; a execução ampliada isolada
  continua registrada com um timeout, sem declarar 204/204 naquela execução.
- Capturas desktop 1440 × 900, celular e texto 200% inspecionadas. Refinamento
  posterior limitou padding físico e empilhou rótulos dos checkboxes quando
  o texto cresce, sem alterar ações. Build repetido e aprovado em
  `desktop-conta-notificacoes-build-final.log`, seguido da rodada focal acima.
  Lint do teste de captura repetido e aprovado. Artefatos permanecem ignorados.
- Integração real T14 focal: 15/15 aprovados, sem skips, em 47,4 s
  (`desktop-conta-notificacoes-http.log`). Perfil/isolamento, concessão e TOTP,
  agrupamento/leitura por versão/destinos, preferências versionadas, silêncio
  e histórico, com PostgreSQL/Auth/Storage locais e fixtures sintéticas.
- Navegador real: os dois casos de `recovery.spec.ts` passaram (cadastro,
  confirmação, recuperação e saída em outra aba). `privacy.spec.ts` atravessou
  uma longa interrupção e terminou com timeout de parede de 20,1 h ao procurar
  o formulário de registro. Evidência preservada em histórico privado antes
  da repetição, sem alterar timeout nem código de produção. A repetição isolada
  passou em 1,2 min (`desktop-conta-notificacoes-privacy-real-retry.log`), incluindo
  bilhetes versionados, reações, retomada, isolamento de mídia e configuração/
  verificação real de MFA pela nova composição da conta.
- Supervisor retomado após autenticar o backup devido: `LOCAL_READY` e saúde
  de 25/10 às 12:21:54Z com exit 0/status `ready`, PostgreSQL/Auth/Storage/Next/
  mídia/outbox prontos e códigos vazios. `/conta` e `/notificacoes` responderam
  HTTP 200. Aplicação mantida para o teste manual do usuário; índice Git vazio.

As provas usam fixtures sintéticas e limpeza existente. Leitor de tela e
aparelhos físicos não foram verificados.

## Entrega Git

Entrega autorizada em dois commits: interface e testes; documentação da direção
e das evidências. Escopo limitado aos 18 arquivos de código, testes e documentos,
sem artefatos, credenciais ou relatórios privados. Lint dos arquivos TypeScript
afetados repetido e aprovado antes dos commits.
