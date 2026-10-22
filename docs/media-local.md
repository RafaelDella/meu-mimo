# Mídia privada local — T06

Desenho, D07 e D08 aprovados em 22/10/2026, com confirmação separada de retenção.
T06 usa [identidade](identity-local.md), [lojas](stores-local.md) e Storage
reais. A prova inicial T06 usava assuntos fictícios; a cadeia atual integra
evidências T07/T08 e álbuns T11 a origens reais. Os testes MEMORY usam crédito,
resgate e álbum pelas APIs, sem exceção de autorização para fixtures.

## Preparar e verificar

Com Node 24, pacotes instalados e Docker Desktop Linux ativo:

```sh
npm --prefix web run local:prepare:t06
npm --prefix web run db:migrate:dev:t06
npm --prefix web run db:migrate:integration:t06
npm --prefix web run db:migrate:check
npm --prefix web run media:fixtures
npm run check
npm --prefix web run test:integration:t06
npm run web:test:e2e
```

Os bancos são `meumimo_t06`, `meumimo_t06_dev` e `meumimo_t06_shadow`;
Auth/Storage permanecem em `postgres`. Sem reset ou migração em produção.
Estado privado em `.artifacts/t06-runtime/integration.json`; `.env.local`
gerenciado aponta ao desenvolvimento em 4301. Arquivo personalizado é preservado.

O bootstrap cria/confere `meumimo-t06-private`, sempre privado. A política
restritiva versionada em `web/supabase/media-policies.sql` impede acesso direto
anon/authenticated, mesmo se houver política permissiva de outro bucket.
O schema gerenciado do Storage não é recriado pelo Prisma. Prefixos
`development/` e `integration/` isolam arquivos dos dois bancos.

## Processos e credenciais

Em terminais separados:

```sh
npm run web:dev
npm --prefix web run media:dev
```

Next usa banco restrito, chave pública Auth e segredo interno do gateway. O
processo de mídia recebe service role somente no seu ambiente separado, para
operar o bucket reservado; sua conexão Prisma continua restrita. O Next não
recebe chave administrativa, segredo JWT ou URL de migração.

O processo escuta somente em `127.0.0.1:4311`; chamadas internas têm MAC curto,
ação/alvo/corpo delimitados e identidade revalidada. Leituras da aplicação usam
URL de cinco minutos ligada à sessão. GET/Range revalida audiência/estado; URL
anterior também é negada após revogação ou remoção. Não há redirecionamento ao
Storage nem token nativo de upload de duas horas entregue ao navegador.

`media:once:t06` processa até dez arquivos no banco de integração e imprime
somente contagens; `media:purge:t06` aplica D08, elimina originais já processados,
expurga remoções e reconcilia objetos privados tardios. Não executar durante
suítes determinísticas.
O driver HTTP inicia seu próprio processo de mídia em modo manual e o encerra
junto com o Next. Não reutiliza portas ocupadas. Builds e testes ficam em série.
Para entregar notificações do domínio T06, usar `outbox:dev:t06` ou
`outbox:once:t06`; o comando original de T05 continua apontando aos bancos T05.

## Arquivos, processamento e retomada

Partes de até 5 MiB têm offset e SHA-256. O banco só avança após confirmar
Storage e revalidar acesso; repetição recupera a mesma parte. Original inteiro
de 100 MB não é enviado como objeto único: partes são menores que o teto global
de 50 MiB da stack. Saída de vídeo é limitada a 40 MB e miniatura a 2 MB.

Sharp 0.35.5 é dependência direta. No Windows, `media:tools` prepara FFmpeg e
ffprobe 9.0.2 Essentials em `.artifacts/t06-tools/`, sem instalação global.
O pacote vem do distribuidor Gyan, indicado por ffmpeg.org, ou seu mirror
GitHub; SHA-256 fixado `60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba`.
Download em blocos retoma o parcial, mas só extrai após validar o hash completo.
Licenças e fontes do pacote permanecem no diretório local. No Linux/CI, usar
FFmpeg/ffprobe 6 ou superior da distribuição; versão efetiva é registrada no log.

Fotos têm orientação aplicada, limite de 40 MP e derivados JPEG sem EXIF/GPS.
Vídeos SDR H.264/HEVC 8-bit em MP4/MOV passam por transcodificação; áudio AAC,
ALAC/PCM aceito é convertido a AAC e silêncio permanece sem faixa de áudio.
HDR e formatos não comprovados falham explicitamente; HEIC/HEIF/GIF/SVG e
animação não são aceitos. FFmpeg usa argumentos fixos, arquivos locais, tempo
limitado e até duas threads. Lease/CAS impede publicar resultado antigo.

UUID, checksum e estado persistidos permitem retomar após nova sessão. A UI
solicita o mesmo original quando ele não estiver mais selecionado; o navegador
não guarda arquivo, nome privado ou token em localStorage/sessionStorage.
Antes de continuar, o replay da reserva confere o SHA-256 do original reescolhido;
um arquivo diferente não envia partes nem destrói o progresso anterior.
Uma falha transitória pode ser repetida explicitamente sem outra reserva;
arquivo inválido pede remoção e nova seleção.
Descarte após tentativa ou envio exige confirmação; cancelar e Escape preservam
o item e devolvem foco ao botão. Seleção ainda não tentada pode ser retirada diretamente.

## Fronteiras

`registerMediaCollection`, `nextEvidenceRevision` e `publishMedia` são internos
e usados pela transação da origem validada. T07/T08 integram registros reais;
[T11](albums-local.md) integra publicação, ordem, legenda e retenção do ticket.
Não há criação pública de coleção ou publicação do
álbum por UUID arbitrário. Evidência histórica é preservada por versão.

`/visual-check/midia` é composição fictícia em memória, com transporte injetado.
HTTP real prova Auth/DB/Storage; a composição prova estados/foco/contexto. Não
substitui câmera/galeria, reprodução em Android/iPhone reais ou leitor de tela.
Os nove arquivos sintéticos são gerados localmente em `.artifacts`, fora do Git.

Remoção explícita ou por prazo oculta antes do expurgo; a exclusão física é
repetível e espera tentativas anteriores. D08 limpa rascunhos não publicados após
24h sem atividade, revalidando atividade e lease; uma parte retomada atualiza a
atividade antes da gravação externa. READY permite limpar as partes originais,
preservando derivados e consulta; falhas físicas têm retry, sem ocultar a mídia.
Temporários de tentativas interrompidas também são reconciliados dentro do
diretório reservado, após dez minutos e sem lease vigente; nomes desconhecidos
e links não são percorridos. Isso cobre a queda que impede executar o finally.

Evidência publicada expira após 180 dias, somente sem proteção. O álbum fica
durante a relação ativa e por até 12 meses de calendário após encerramento.
`setMediaRetention` é interno e deve ser chamado pela origem na mesma transação
da análise/contestação ou encerramento. `retentionHold` inicia true e o prazo do
álbum inicia null: não inferir ausência de pendências sem domínio integrado.
O worker normal executa processamento e manutenção; --once só processa, para
permitir provas determinísticas. O limite de 24h dos originais exige consumidor
saudável; publicação/monitoramento operacional ainda pertencem ao piloto.
Histórico estruturado, backups,
exportação/anonimização e restauração operacional completa pertencem a T14.
Nenhum serviço pago, publicação ou arquivo pessoal foi usado.

## Integração da origem T07

[T07](activities-local.md) registra coleção EVIDENCE no rascunho e publica a foto
READY na transação do recebimento. A mesma transação fecha uploads, preserva a
evidência contra remoção genérica e atualiza hold: true manual/PENDING, false
automático/APPROVED. Rascunho continua restrito ao autor, inclusive para lojista.
Namespaces t07-development/t07-integration compartilham somente o bucket privado
e ferramentas de T06; bancos, credenciais de gateway e temporários são próprios.
Complemento/análise são T08 e álbum real continua T11.

T08 integra complementos de evidência reais durante pausa, com uma seleção
por revisão e proteção D08 na transação da análise. A consulta de evidências
ordena revisões mais recentes primeiro; a interface carrega arquivos anteriores
por páginas e revalida o conjunto aberto ao atualizar. Álbuns mantêm sua ordem.
Contrato e comandos próprios em [T08 local](points-local.md).
