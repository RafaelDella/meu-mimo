# Meu Mimo — protótipo da pessoa convidada

Protótipo responsivo, em português, baseado no `design.md` da raiz do projeto. Usa HTML, CSS e JavaScript, sem dependências de instalação ou etapa de build.

## Executar

Com Node.js disponível, execute nesta pasta:

```sh
npm run dev
```

Abra `http://localhost:4173`. No celular, o app ocupa a tela; no computador, aparece em uma moldura de telefone. O servidor de desenvolvimento fica restrito ao computador local. A versão hospedada pode ser aberta pelo celular.

## Interações

- Saldo inicial de 240 pontos e extrato das entradas e saídas.
- Três atividades, com conclusão limitada a uma vez por dia no horário de São Paulo.
- Vitrine com filtros, detalhes das recompensas e validação de saldo antes do resgate.
- Confirmação de resgate com ticket na aba Meus mimos.
- Bilhete personalizado e opção de reiniciar a demonstração no perfil.
- Persistência das escolhas no navegador com `localStorage`.
- Navegação por teclado, diálogos nativos e respeito à preferência de movimento reduzido.

## Validar

```sh
npm test
```

O protótipo usa dados de exemplo. Não há contas, convites reais, sincronização entre dispositivos ou notificações para outra pessoa.

## Identidade e assets

As cores e a direção visual vêm de `../design.md`. As ilustrações de recompensas são SVGs originais. O sticker do gatinho foi criado com ImageGen; veja `ASSETS.md` para o prompt. As fontes DM Sans e DM Serif Display são carregadas pelo Google Fonts, com alternativas locais de sistema.
