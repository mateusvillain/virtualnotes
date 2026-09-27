# Template de Issue (filha de uma Epic)

Uma Issue é a menor unidade de trabalho executável — deve poder ser pega por uma pessoa
e concluída sem precisar renegociar o escopo no meio do caminho. No GitHub é uma issue
associada ao Milestone da feature e ligada à Epic como sub-issue.

O texto abaixo é o **corpo** da issue; o `[Nome da Issue]` é o título da issue.

```markdown
> Epic: #N [Nome da Epic] · PRD: [[Nome da Feature]](link-da-pagina-da-wiki)

## Objetivo

O que essa issue especificamente entrega, em 1 frase. Se você precisa de "e" para
descrever o objetivo (ex: "criar o formulário E integrar com a API"), provavelmente é
mais de uma issue.

## Contexto

Por que essa issue existe e como ela se encaixa na Epic/PRD. Uma pessoa que nunca viu o
PRD deveria conseguir entender o suficiente para começar a trabalhar.

## Critérios de aceite

Lista verificável, binária, do que precisa ser verdade para a issue ser considerada pronta.
Herda do PRD/Epic o que for aplicável, mas específico para o recorte desta issue.

## Tarefas

Checklist de passos concretos de execução (não é obrigatório ser exaustivo, mas deve dar
um ponto de partida claro). Use `- [ ]`.

## Arquivos relevantes

Caminhos de arquivos, módulos ou áreas do código prováveis de serem tocados, quando
identificáveis pelo contexto. Se não for possível saber, escreva "A definir na execução".

## Blocked by

Lista de outras Issues (`#N`) que precisam estar prontas antes desta poder começar. Se não
houver, escreva "Nenhuma".
```

## Regras para quebrar uma Epic em Issues

1. **Uma issue, uma unidade de trabalho.** Se ao escrever o Objetivo você usa "e"/"depois"
   para encadear duas coisas, quebre em duas issues.
2. **Otimize para paralelismo, não para ordem de execução "óbvia".** O instinto natural é
   sequenciar tudo (design → API → integração → testes). Antes de aceitar isso, pergunte:
   essas partes têm de fato uma dependência de dado/contrato, ou é só hábito de trabalhar
   em ordem? Um contrato de API acordado antecipadamente (ex: schema definido na própria
   Epic ou em uma issue curta de "definir contrato") costuma liberar frontend e backend
   para rodar em paralelo em vez de em série.
3. **`Blocked by` só para dependência real e direta.** Não marque uma issue como blocked
   by outra só porque "faz mais sentido" fazer depois — isso mata paralelismo
   artificialmente. A dependência tem que ser: a issue B literalmente não pode começar (ou
   não pode ser testada) sem um artefato concreto que só existe depois que A termina
   (schema, endpoint, componente, decisão).
4. **Tamanho:** cada issue deve ser algo que uma pessoa consegue concluir em um período
   curto e contido (pense em "poucos dias", não "semanas"). Se está maior que isso, quebre.
5. **Issues sem dependências vêm primeiro na lista e devem ser destacadas no resumo** —
   são o que permite começar a trabalhar imediatamente enquanto o resto é discutido.

## Notas específicas do GitHub

- **Enquanto o plano não foi publicado, referencie dependências pelo título**, não por
  `#N` — os números só existem depois da criação. Na publicação, troque cada título pelo
  número real.
- **Escrever `Blocked by #N` no corpo cria uma menção cruzada** que aparece como
  timeline na issue A ("referenced by"), o que é justamente o efeito desejado: quem abre a
  issue bloqueante vê quem depende dela. Não é uma dependência forçada pelo GitHub —
  ninguém é impedido de fechar fora de ordem, é uma convenção de leitura.
- **Toda issue bloqueada leva a label `blocked`**, e ela deve ser removida quando o
  bloqueio cai. Issues sem bloqueio ficam sem essa label — o filtro
  `is:open -label:blocked` vira a fila de trabalho pronto para começar.
- Evite a palavra `closes`/`fixes` seguida de `#N` no corpo de uma issue de plano — esses
  verbos são para PRs e podem fechar coisa errada quando copiados para a mensagem de commit.
