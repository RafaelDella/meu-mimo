# T06 — mídia privada e processamento local

Estado: desenho, D07 e limite de upload confirmados pelo idealizador em
22/10/2026. D08 foi confirmada em resposta separada na mesma data. Base c84347d, após T05.
Nenhum serviço pago ou publicação faz parte deste trabalho.

## Objetivo e fronteira

Preparar arquivos privados e retomáveis para a foto opcional de um registro e
para as fotos/vídeos do álbum de um ticket. T06 entrega autorização, transporte,
processamento, consulta de derivados e limpeza recuperável. T07/T09/T11 ligam
essa infraestrutura aos recursos reais e à revisão/publicação de momentos.

Não criar endpoint público que invente registro, ticket ou participação. Assim
como a conversa de T05, a coleção de mídia é registrada por função interna na
transação da origem. Testes usam assuntos fictícios explicitamente identificados.
Não alterar pontos, estoque, realização de ticket ou dados da demonstração.

## D07 e limite de requisições confirmados

- Evidência: uma foto opcional por envio/versão, enviada pelo participante da
  origem. Complemento solicitado pode abrir nova versão no mesmo registro;
  preservar fotos anteriores no histórico, sem criar ocorrência ou crédito.
  Somente o módulo de origem pode abrir essa versão, nunca o endpoint de upload.
- Memória: até 20 itens por ticket, até 10 arquivos por reserva/lote, enviados pelo
  lojista. Arquivos em envio/processamento também ocupam vaga até serem removidos.
- Foto: até 10 MB (10.000.000 bytes), JPEG, PNG ou WebP. Rejeitar HEIC/HEIF nesta
  etapa sem prova de processamento. Não aceitar SVG, GIF ou imagem animada.
- Entrega da foto: JPEG tratado até 2.048 px no maior lado, sem ampliação;
  miniatura até 480 px; orientação aplicada e metadados EXIF/GPS removidos.
- Vídeo: até 100 MB (100.000.000 bytes) e 60 segundos, entrada MP4/MOV. Processar
  para MP4 com H.264, áudio AAC quando houver áudio, pixels yuv420p e maior lado
  até 1.920 px/menor lado até 1.080 px, respeitando a orientação. Vídeo silencioso
  continua silencioso; HDR/codec não comprovado deve falhar explicitamente.
- Validar conteúdo decodificável, tamanho real, dimensões/pixels, duração e
  streams; nome/extensão/MIME declarados não são prova de formato.
- Até 20 reservas/autorizações de upload por minuto por conta. Metadados e ações
  normais reutilizam os limites de T04. Transporte de partes tem limite próprio
  por arquivo e uma parte em andamento no cliente, para não tornar 100 MB inviável.
- Consulta com URL da aplicação válida por cinco minutos, vinculada à sessão e
  ao arquivo/variante. Cada GET/Range exige sessão e autorização atuais. Expiração
  pede nova consulta; nunca expor URL pública, original ou token nativo do Storage.

Limites defensivos de implementação, sujeitos à prova técnica: partes de até
5 MiB, fotos até 40 megapixels, vídeo até 4K na entrada, tempo/concorrência de
processamento limitados. Não truncar vídeo longo para fazê-lo parecer válido.

## Audiência e vínculo de domínio

Coleção tem loja, participação, propósito EVIDENCE/MEMORY e origem tipada
SUBMISSION/TICKET. Unicidade da origem impede anexá-la a outra loja/relação.
Versões de evidência pertencem à mesma coleção; cada versão admite uma foto,
e a origem controla qual versão pode receber envio. Fotos históricas não ocupam
a vaga da versão de complemento, mas continuam sujeitas à retenção/proteção.
Identidade, autor e destinatário derivam do contexto autorizado; IDs recebidos
não concedem acesso. AdminGrant não amplia a audiência.

Antes da anexação/publicação interna, somente o autor vê seus rascunhos e
derivados. Depois, participante da origem e lojista autorizado podem consultar.
Outro participante, outra loja, conta suspensa ou vínculo revogado não acessam
metadados, foto, miniatura nem Range de vídeo. Encerramento preserva histórico.
Remoção lógica torna todas as variantes indisponíveis imediatamente.

O módulo de origem controla fechamento de uploads/publicação e proteção de
retenção. Pausa/encerramento impedem novos envios de evidência; arquivos de
memória de tickets existentes seguem a permissão explícita da origem, permitindo
tratar tickets preservados por D03. T06 não presume que um ticket existe ou pode
ser editado. Mudança de contexto aborta transporte e limpa URLs/estado na UI.

## Arquitetura escolhida pelo integrador

Manter Supabase Storage e Prisma. O Storage local usa seu schema gerenciado em
postgres; o domínio T06 usa bancos separados. Políticas do Storage não conseguem
consultar diretamente essas tabelas de outro banco. Além disso, o SDK instalado
fixa o token nativo de upload em duas horas, sem reautorização em cada retomada.

Por isso, usar gateway da aplicação e processo de mídia separado:

1. Next valida sessão/contexto e encaminha operações delimitadas ao processo
   local de mídia. Sem service role, chave JWT administrativa ou conexão de
   migração no Next. Nenhum caminho de objeto é aceito do navegador.
2. Processo de mídia em loopback, porta reservada 4311, recebe somente chamadas
   autenticadas do Next com autenticação interna e validade curta. Revalida a
   identidade/relação no banco restrito antes de cada ação. Usa service role
   somente para bucket privado reservado e caminhos derivados de IDs validados.
3. Partes têm índice/offset, tamanho e SHA-256. Repetição idêntica recupera o
   resultado; dados diferentes para a mesma tentativa são conflito. Estado e
   partes persistidos sobrevivem à reinicialização do processo. A retomada
   consulta progresso autorizado antes de continuar; não emite token de duas horas.
4. Após completar os bytes, processamento ocorre fora de transações longas.
   Lease e confirmação condicional impedem um consumidor antigo de publicar
   resultados após remoção ou outra tentativa. Saída pronta só é confirmada
   quando ambas as variantes privadas existem. Falha preserva tentativa recuperável.
5. Consulta de arquivo passa novamente pela aplicação; resposta privada/no-store,
   Content-Type fixado, nosniff e Range delimitado para vídeo. Nunca redirecionar
   ao objeto administrativo nem guardar URL temporária no modelo de domínio.

O gateway acrescenta passagem de bytes pelo servidor; isso é aceitável na prova
local. Upload direto é alternativa futura se houver autorização igualmente forte
no Storage. Não adotar uma assinatura longa como substituta da revogação atual.

Sharp 0.35.5 foi fixado como dependência direta. FFmpeg/ffprobe 9.0.2 foram
preparados localmente no Windows, com origem e hash registrados em
[mídia local](../../media-local.md), sem instalação global. No Linux, o comando
exige versão 6 ou superior da distribuição e registra a versão efetiva.
Não usar o FFmpeg de captura do Playwright como transcodificador. Processos usam
argumentos fixos, sem shell, entradas locais delimitadas e limites de recursos/tempo.

## D08 confirmada

- Órfãos/rascunhos não anexados: remover após 24 horas sem atividade. Revalidar
  atividade e lease antes de marcar indisponível; retomada recente impede limpeza.
- Originais/partes: apagar assim que derivados estiverem confirmados, com retry;
  prazo máximo proposto de 24 horas após processamento. Não entregá-los ao usuário.
- Evidência: 180 dias desde a publicação, sem expurgo durante análise/contestação.
- Álbum: durante relação ativa e por até 12 meses de calendário após encerramento.
- Histórico estruturado: até 24 meses após encerramento e resolução de pendências.
- Backups: janela de até 30 dias; restauração deve reaplicar exclusões.
- Exportação/exclusão manual identificável antes do piloto; não apagar pendências
  automaticamente. Exclusão de mídia não altera pontos ou ticket.

São decisões confirmadas de produto, sem apresentação como exigência legal.
T06 implementa limpeza de órfãos/originais e o mecanismo de expurgo com
prazo/proteção fornecidos pela origem. `setMediaRetention` é interno: mantém
proteção durante análise e calcula o prazo do álbum pelo encerramento informado.
A evidência usa a data da publicação de cada versão. Sem domínio integrado, proteção
conservadora impede inferir ausência de pendências. Histórico estruturado,
backups, exportação/anonimização e restauração completa continuam em T14.
Ocultar precede excluir objeto; interrupção retoma sem restaurar visibilidade.

## Aceite e provas

- API real com dois participantes, lojista, outra loja/admin, suspensão/revogação;
  provar também acesso direto ao Storage negado com chave pública/JWT comum.
- Arquivos sintéticos gerados localmente: JPEG com orientação/GPS, PNG/WebP,
  MP4/MOV com áudio/rotação e vídeo silencioso. Provar derivados, dimensões,
  metadados, codecs e reprodução automatizada possível no navegador.
- Provar MIME falso, bytes truncados, excesso de bytes/pixels/duração, HEIC não
  comprovado, parte duplicada/conflitante, concorrência, timeout e reinicialização.
- Interromper/retomar upload, revogar entre partes, URL expirada e revogação
  entre emissão e GET/Range; nenhuma mídia de outra relação é revelada.
- Relógio controlado em fixtures prova órfão de 24h, proteção de análise,
  remoção lógica imediata e exclusão física idempotente após falha.
- Componente reutilizável: progresso/erro por arquivo, retry sem duplicação,
  câmera/galeria indisponível com alternativa, foco/teclado, 320/390 px,
  texto 200%, movimento reduzido e contexto limpo. Composição fictícia permanece
  explicitamente separada da prova HTTP com Storage e banco reais.
- Check, cadeia de migrações, regressões T02/T04/T05, revisão independente e scan
  de segredos antes do commit. Recursos mutáveis executados em série.

Câmera/galeria e reprodução em Android/iPhone reais dependem dos aparelhos e
versões ainda não definidos em D09. Arquivo sintético/Chromium não comprova esses
aceites. Registrar a pendência e não marcar essa parte do roadmap como concluída
sem observação. Processamento local não autoriza infraestrutura publicada.

## Fontes e decisões técnicas

- [Storage e RLS](https://supabase.com/docs/guides/storage/security/access-control).
- [URLs de download e validade](https://supabase.com/docs/guides/storage/serving/downloads).
- [Sharp: saída sem metadados por padrão](https://sharp.pixelplumbing.com/api-output/).
- [FFmpeg: distribuição](https://www.ffmpeg.org/download.html) e
  [processamento](https://www.ffmpeg.org/ffmpeg.html).

Context7 foi descoberto e consultado para Supabase. Assinaturas também foram
conferidas no SDK instalado 2.118.0. A versão e o hash das ferramentas de vídeo
foram fixados antes da instalação, após aprovação deste desenho.

Revisão independente do desenho concluída. A única lacuna de produto encontrada
foi a conciliação entre uma foto e complemento de evidência; a proposta acima
preserva uma foto por envio/versão e as anteriores no histórico, confirmados
junto com D07. Nenhum código de produto foi implementado antes dessa decisão.
