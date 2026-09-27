# Template de Epic (issue com label `epic`)

Uma Epic é a "casca" que agrupa um conjunto coeso de Issues que juntas entregam um
pedaço fechado do PRD. Ela não é uma tarefa executável em si — no GitHub é uma issue
normal marcada com a label `epic`, associada ao Milestone da feature, cujas filhas são
ligadas como sub-issues.

O texto abaixo é o **corpo** da issue; o `[Nome da Epic]` é o título da issue, não uma
heading dentro do corpo.

```markdown
> PRD: [[Nome da Feature]](link-da-pagina-da-wiki) · Milestone: [nome](link)

## Objetivo

O que esse recorte do PRD entrega, em 1-2 frases. Deve amarrar claramente de volta a
uma parte específica do PRD (ex: "cobre o fluxo principal descrito no PRD, etapas 1-4").

## Escopo

O que está dentro desse recorte — em termos de funcionalidade, não de tarefas técnicas.
Se a Epic cobre só uma parte do PRD, seja explícito sobre qual parte.

## Critérios de conclusão

Quando essa Epic pode ser considerada pronta. Geralmente é a soma dos critérios de aceite
das Issues filhas, mas escrito no nível de "o que o usuário/negócio ganha", não checklist
técnico.

## Issues

- [ ] #N [Título da issue]
- [ ] #N [Título da issue]

## Dependências

Outras Epics (ou fatores externos) que precisam estar prontos antes desta começar, ou
que rodam em paralelo com acordo de interface. Se não houver, escreva "Nenhuma".
```

## Como quebrar o PRD em Epics

Pense em Epics como fatias verticais sempre que possível — cada uma deveria, na medida
do possível, ser testável e demonstrável de ponta a ponta, mesmo que pequena. Evite
fatiar por camada técnica (ex: "Epic de backend" + "Epic de frontend" da mesma feature),
porque isso cria acoplamento forte entre Epics e mata o paralelismo — prefira fatiar por
capacidade entregável (ex: "Cadastro de item" e "Busca de item" em vez de "Backend" e
"Frontend").

Número de Epics: normalmente entre 2 e 6 para uma feature de porte médio. Menos que isso
e provavelmente devia ser só Issues soltas sem Epic; mais que isso, reavalie se o PRD não
é grande demais para um único ciclo de planejamento.

## Notas específicas do GitHub

- A seção **Issues** só pode ser preenchida com os `#N` reais depois que as filhas forem
  criadas — na publicação, crie a Epic primeiro (para ter o número dela), depois as
  filhas, e por último edite o corpo da Epic com a lista. Ela é a "página inicial" da
  Epic para quem chega pela aba Issues.
- Use a label `epic` sempre, e considere uma label de área (`frontend`, `api`, …) só se o
  repositório já tiver essa convenção — não invente taxonomia de labels nova.
- Se o repositório usar templates de issue (`.github/ISSUE_TEMPLATE/`), respeite os campos
  obrigatórios deles e encaixe as seções acima dentro do formato existente em vez de
  ignorá-lo.
