# Verificação do protótipo

## Testes automatizados

Sete testes passaram com o runner nativo do Node.js:

- Uma atividade soma pontos apenas uma vez no mesmo dia.
- Uma nova data permite uma nova conclusão da atividade.
- Um resgate gera um ticket e um débito correspondente.
- Saldo insuficiente preserva o saldo e impede o resgate.
- Gastar exatamente o saldo disponível não produz valores negativos.
- As escolhas persistem ao salvar e carregar o estado do navegador.
- Armazenamento inválido ou indisponível permite continuar a demonstração.

Os arquivos JavaScript da aplicação e o servidor também passaram pela verificação de sintaxe.

## Navegador

- Em 390 × 844, concluir uma atividade elevou o saldo de 240 para 270 pontos.
- Um date de 300 pontos exibiu os 30 pontos restantes e ofereceu navegação para atividades.
- Resgatar um café de 120 pontos gerou confirmação, ticket e saldo de 150 pontos.
- Recarregar a página preservou o ticket e o saldo.
- O filtro Pra você exibiu apenas a recompensa de delivery.
- Reiniciar a demonstração restaurou o saldo inicial e limpou as conquistas e os tickets.
- A largura de 320 pixels foi verificada; um excesso lateral causado pelo sticker foi corrigido e a largura do documento voltou a coincidir com a área útil.
- A composição em uma moldura de telefone foi conferida em 1366 × 1000.
- Nenhum erro ou aviso foi registrado no console durante o fluxo testado.

Capturas locais de conferência ficam em `qa/`, ignorada pelo Git.
