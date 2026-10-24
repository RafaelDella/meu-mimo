# Cadastro e login — auditoria e direção de interface

Pedido: tornar cadastro e login funcionais e melhorar UI/UX com stickers e ícones,
preservando a identidade do Meu Mimo. As escolhas abaixo são de implementação;
não representam nova aprovação de contrato pelo usuário.

## Auditoria

- A autenticação já usa Supabase real: e-mail verificado, senha, PKCE e recuperação.
  A interface controla sessão, revalidação, saída, perfil, preferências e MFA.
- Três botões equivalentes disputam o topo, inclusive a recuperação. O título
  genérico não identifica a etapa. A senha não oferece consulta visual.
- O cadastro informa pouco sobre a confirmação por e-mail; após solicitar um
  link, há apenas uma mensagem sem uma próxima ação clara.
- Baseline: 8/8 testes Chromium aprovados. Captura desktop inspecionada.
- O supervisor antigo está registrado como READY, mas seu processo e os três
  filhos terminaram. As portas estão livres. Retomada deve usar a custódia
  canônica, que arquiva o estado anterior; não apagar locks, journal ou chaves.

## Abordagens e escolha

1. Apenas decorar: menor alteração, mas mantém a ambiguidade dos formulários.
2. Reorganizar os formulários existentes e seus estados: escolhida por manter
   autenticação, componentes e assets locais, com uma tarefa clara por etapa.
3. Separar URLs ou trocar provedor: amplia contratos sem necessidade deste pedido.

## Direção

Desktop em duas colunas: apresentação com gato, envelope e presente da biblioteca
atual, e cartão de acesso. Papel, rosa framboesa, serifas e colagem discreta.
Celular compacto, sem decoração atrapalhar o formulário. Stickers são decorativos.
Ícones seguem o SVG existente; não há nova dependência ou serviço.

Entrar e Criar conta são os dois seletores principais; recuperar senha é uma ação
junto da senha. Cada modo tem título e orientação próprios. Senha permite mostrar
e ocultar, conserva autocomplete e não bloqueia colagem/gerenciadores. Cadastro
explica oito caracteres e confirmação por e-mail antes do envio.

Após cadastro/recuperação, o cartão mostra envelope, orientação neutra, endereço
informado e ações para corrigir o e-mail ou voltar ao login. Nenhuma afirmação
revela se existe conta. Não reenviar automaticamente. Solicitações pendentes
têm estado anunciado e guarda contra duplicação; erros mantêm dados para tentar
novamente. Transições que removem o controle ativo conduzem foco ao título/campo.

Preservar destinos internos validados, recuperação restrita, revalidação oculta,
perfil, notificações, MFA e saída. O contrato de retorno padrão /conta permanece;
Minhas lojas continua como ação primária após autenticação.

## Aceite

Teclado/foco e leitores pela semântica; rótulos, feedback vivo, alvos 44 px,
320/390 px, desktop 1280/1440 px, texto 200% e movimento reduzido. Testes de UI
controlam estados/falhas; prova HTTP usa Supabase/PostgreSQL/Mailpit reais.
Uma prova de navegador deve completar cadastro, confirmação, saída/login e
recuperação com conta sintética e limpeza pelo fixture existente. Sem dados
reais ou artefatos privados no Git. Novas alterações não serão commitadas sem pedido.
