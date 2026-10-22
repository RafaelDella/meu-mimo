# Atividades e conquistas locais — T07

T07 integra atividades, registros, foto privada, conversa, recebimento e crédito
automático. Use a stack de identidade existente em loopback; nenhum serviço
publicado ou pago é necessário. O desenho e D04 foram confirmados pelo idealizador.

## Preparar e executar

Com Docker Linux saudável e dependências instaladas conforme o onboarding:

```sh
npm --prefix web run local:start
npm --prefix web run local:prepare:t07
npm --prefix web run db:migrate:dev:t07
npm --prefix web run db:migrate:integration:t07
npm --prefix web run media:fixtures:t07
npm run check
npm --prefix web run db:migrate:check
npm --prefix web run test:integration:t07
```

O preparo reaproveita o bucket privado e as ferramentas de mídia de T06. No
Windows, execute `media:tools` conforme [mídia local](media-local.md) se as
ferramentas ainda não estiverem disponíveis. Não instale o pacote npm `docker`.
Não apague o estado local nem recrie bancos para atualizar a cadeia.

Para desenvolvimento, execute em terminais separados:

```sh
npm --prefix web run media:dev:t07
npm --prefix web run outbox:dev:t07
npm run web:dev
```

Abra `/lojas`, crie uma loja, cadastre uma atividade e convide outra conta.
O lojista não pontua na própria loja. Atividade nova começa em aprovação manual
e exige escolher pontos; nenhuma pontuação ou atividade da prévia é importada.
O participante abre a atividade e envia legenda/foto opcionais após revisar a
regra. O lojista consulta os registros recebidos. Aprovação manual está em [T08 local](points-local.md);
os registros manuais permanecem pendentes nesta etapa.

| Recurso | Desenvolvimento | Integração |
| --- | --- | --- |
| Banco | meumimo_t07_dev | meumimo_t07 |
| Shadow | meumimo_t07_shadow | separado do domínio de teste |
| Next | 127.0.0.1:4301 | 127.0.0.1:4310 |
| Processo de mídia | 127.0.0.1:4311 | mesma porta, execução serial |
| Namespace privado | t07-development | t07-integration |

O bucket continua `meumimo-t06-private`, com acesso direto negado aos papéis
anon/authenticated. O namespace distingue bytes e temporários. A configuração
ignorada em `.artifacts/t07-runtime` separa migração, fixtures, consumidor e
runtime. O Next recebe credencial restrita de banco e segredo do gateway; nunca
recebe service role, credencial de migração ou senha dos fixtures. `.env.local`
aponta para desenvolvimento. O harness injeta integração somente em seu processo.
Build, typegen, migrações e todos os servidores são serializados no checkout.

## Contrato implementado

- Atividade compartilhada: nome/categoria até 80, descrição até 1.000; pontos de
  1 a 1.000.000; única, diária ou semanal com limite de 1 a 100. As mutações têm
  identificação idempotente e auditoria imutável. Edição/arquivo também exigem
  a versão esperada; cadastro cria a versão 1.
- O relógio é do banco e os períodos são de calendário no fuso da loja. Semana
  começa segunda às 00h; dias de horário de verão podem ter 23/25h. Sem retroatividade.
  Alterar frequência conta todos os recebidos no período da nova regra.
- Preparar cria um rascunho privado e uma coleção de evidência. Não cria saldo,
  ocorrência, notificação ou conversa. A URL mantém o UUID para recuperar o mesmo
  rascunho; o navegador não persiste legenda/foto em localStorage.
- Receber manual gera pendência sem crédito. Receber automático aprova e cria
  um crédito, eventos, conversa, proteção de mídia e outbox na mesma transação.
  Falha intermediária desfaz todos esses efeitos. Repetição consulta o resultado
  original com autorização atual, inclusive após pausa/alteração de regra.
- Antes de confirmar, mudança de versão/data/fuso exige revisão. Uma resposta
  incerta mantém o UUID e o corpo; a interface consulta o registro antes de
  repetir. Rascunho/falha não consome limite; recebido sempre ocupa ocorrência.
- Legenda simples e imutável até 500 caracteres Unicode; uma foto opcional READY
  da mesma coleção/autor/revisão. Seleção local, inválida ou processando bloqueia
  confirmação. Recebimento fecha uploads e preserva a evidência contra remoção
  genérica. Manual protege contra expurgo durante análise; automático aplica 180
  dias desde publicação. T08 integra os estados seguintes, complementos e compensações.
- Snapshot recebido é imutável, incluindo regra, pontos, data e legenda. Saldo
  disponível e pendente são strings decimais, sem conversão acumulada para Number.
  O crédito inicial tem chave única e índice parcial por registro; o banco exige
  origem aprovada e valor correspondente.
- Participante acessa sua relação; lojista acessa as relações da própria loja.
  Rascunho só autor. Revogação/suspensão bloqueiam também mídia/conversa/destino.
  Pausa impede novos envios. Encerramento consulta pendências reais, preserva
  histórico e impede novos registros. Conversas recebidas seguem T05 até a origem
  fechar explicitamente comentários.

As rotas abaixo usam `/api/lojas/:storeId`, autenticação, autorização contextual,
`no-store` e CSRF em mutações. Listas padrão 20/máximo 50; leitura 120/min e
mutação 30/min por conta. Upload usa os limites próprios de T06.

| Caminho | Métodos e finalidade |
| --- | --- |
| /atividades | GET busca/estado/página; POST cadastro |
| /atividades/:id | GET detalhe; PATCH versão/configuração |
| /atividades/:id/arquivar | POST arquivo confirmado |
| /atividades/:id/preparar | POST UUID estável → rascunho/coleção |
| /registros | GET activityId/membershipId/status/from/to e página, sem rascunhos |
| /registros/:id | GET rascunho próprio ou recebimento autorizado |
| /registros/:id/enviar | POST legenda/foto e versão/data/fuso revisados |
| /pontos | GET saldo/resumo diário, membershipId para lojista |
| /pontos/movimentos | GET créditos paginados com origem |

`SUBMISSION_RECEIVED` avisa o lojista por outbox. Seu destino e comentários da
origem abrem o registro real após nova autorização. `outbox:once:t07` permite
consumo manual; `media:once:t07` e `media:purge:t07` operam a mídia isolada.

## Fronteiras e verificação

Análise, contestação, anulação/reabertura, compensações e extrato completo estão em [T08 local](points-local.md).
Resgate/estoque/ticket são T09/T10; álbuns T11; painéis completos T12. T07 não
fornece endpoint público para crédito, assunto solto ou publicação arbitrária.

A integração usa Auth, PostgreSQL e Storage reais locais, arquivos sintéticos e
limpeza dos fixtures criados. O navegador usa contratos controlados para exercitar
falhas e estados. A soma acima de Number.MAX_SAFE_INTEGER é provada por SQL
identificado e formatação de strings, sem falsificar crédito ou desligar trigger.
As evidências e limitações estão no [plano T07](superpowers/plans/2026-10-22-t07-atividades.md).
Câmera/galeria e retorno de autenticação em Android/iPhone físicos, leitor de
tela, CI remoto e infraestrutura publicada exigem validação correspondente.
