# Publicando no GitHub via `gh`

Este arquivo só deve ser lido **depois** que o usuário aprovou o plano explicitamente
(ver "Passo 8" no SKILL.md).

A ferramenta padrão aqui é o **`gh` CLI** rodando via Bash. Se o ambiente tiver um servidor
MCP do GitHub disponível, ele pode substituir os comandos equivalentes — mas a ordem de
criação e as regras de segurança abaixo valem igual. Não misture os dois na mesma
publicação; escolha um caminho e siga nele.

## Preflight (antes de escrever qualquer coisa)

Rode e confirme tudo isto **antes** do primeiro comando de escrita:

```bash
gh auth status                                   # autenticado? escopo suficiente?
gh repo view --json nameWithOwner,hasWikiEnabled,viewerPermission
gh label list --limit 100
gh milestone list 2>/dev/null || gh api repos/{owner}/{repo}/milestones --jq '.[].title'
```

- `viewerPermission` precisa ser `WRITE`, `MAINTAIN` ou `ADMIN`. Se for `READ`, pare e
  avise o usuário — nada será criado.
- Se `hasWikiEnabled` for `false`, ou se o clone da Wiki falhar, use o fallback de PRD
  descrito na seção da Wiki.
- Se já existir um Milestone com o nome da feature, **não crie outro** — reuse, e avise o
  usuário que está reusando.

## Ordem de publicação (importante — respeite esta ordem)

### 1. Labels

Garanta que `epic` e `blocked` existem (nomes conforme `.claude/github-planning.json`).
`gh label create` falha se a label já existir, então crie só o que faltou na listagem do
preflight:

```bash
gh label create epic --color 5319E7 --description "Agrupa issues de um recorte do PRD"
gh label create blocked --color B60205 --description "Bloqueada por outra issue"
```

Não crie labels de área ou prioridade que o repositório ainda não usa — taxonomia de
labels é decisão do time, não deste skill.

### 2. Wiki (PRD)

A Wiki é um repositório git separado, em `https://github.com/OWNER/REPO.wiki.git`. O `gh`
não tem comandos de Wiki: use git direto.

```bash
git clone https://github.com/OWNER/REPO.wiki.git /tmp/wiki-REPO
# escreva /tmp/wiki-REPO/Nome-Da-Feature.md com o conteúdo do PRD aprovado
git -C /tmp/wiki-REPO add . && git -C /tmp/wiki-REPO commit -m "docs: PRD — Nome da Feature"
git -C /tmp/wiki-REPO push
```

Guarde a URL final da página (`https://github.com/OWNER/REPO/wiki/Nome-Da-Feature`) — ela
é referenciada no cabeçalho de todas as Epics e Issues.

**Gotcha:** o repositório da Wiki só passa a existir depois que a primeira página é criada
pela interface web. Se o clone falhar com "repository not found" mesmo com a Wiki
habilitada, é isso — peça ao usuário para criar qualquer página inicial pela web (ou
autorize o fallback), não tente contornar.

**Fallback (`prdLocation` != `"wiki"`):** escreva o PRD como arquivo no próprio repo (ex:
`docs/prd/nome-da-feature.md`) e abra um PR com ele. Nesse caso o "link do PRD" usado nas
Epics/Issues é o link permanente do arquivo no branch principal. Não commite direto na
branch default sem o usuário pedir.

### 3. Milestone

Não há subcomando estável de criação de milestone no `gh`; use a API REST:

```bash
gh api repos/{owner}/{repo}/milestones \
  -f title="Nome da Feature" \
  -f description="PRD: https://github.com/OWNER/REPO/wiki/Nome-Da-Feature" \
  --jq '{number, html_url}'
```

Guarde o `number` — ele é usado no `--milestone` das issues (o `gh issue create` também
aceita o título do milestone).

Se o usuário trabalha por release/sprint em vez de por feature, pergunte se prefere
associar as issues a um Milestone já existente em vez de criar um novo — nesse caso pule
a criação e use o milestone escolhido.

### 4. Epics

Uma issue por Epic, com o corpo do template de Epic (ainda **sem** a seção `Issues`
preenchida — os números das filhas não existem ainda):

```bash
gh issue create \
  --title "Nome da Epic" \
  --body-file /tmp/epic-1.md \
  --label epic \
  --milestone "Nome da Feature"
```

Sempre use `--body-file` em vez de `--body` com texto longo — corpos multi-linha em
argumento de shell quebram com aspas, crases e `#`.

Guarde o `#N` de cada Epic criada; ele vai no cabeçalho das filhas.

### 5. Issues filhas

Uma issue por Issue do plano, com o corpo do template de Issue (a seção `Blocked by` ainda
pode estar com os títulos, não os números — será corrigida no passo 7):

```bash
gh issue create \
  --title "Nome da Issue" \
  --body-file /tmp/issue-3.md \
  --milestone "Nome da Feature"
```

Guarde o `#N` de cada uma, mapeado pelo título do plano — esse mapa título→número é o que
converte todas as referências pendentes nos passos seguintes.

### 6. Ligar filhas às Epics (sub-issues)

O GitHub tem uma API de sub-issues que produz a hierarquia nativa:

```bash
# id numérico (database id), NÃO o número da issue nem o node id do GraphQL
SUB_ID=$(gh api repos/{owner}/{repo}/issues/<numero-da-filha> --jq '.id')
gh api --method POST repos/{owner}/{repo}/issues/<numero-da-epic>/sub_issues \
  -F sub_issue_id="$SUB_ID"
```

Note a distinção: `sub_issue_id` é o **id interno** da issue (`.id` da REST API), não o
`number` que aparece como `#N`. Passar o número é o erro mais comum aqui e retorna 404 ou
associa a issue errada.

Essa API pode não estar disponível dependendo do plano/versão do GitHub em uso. Se falhar,
**não insista** — o fallback é suficiente e é o que a seção `Issues` do template de Epic já
prevê: a checklist `- [ ] #N` no corpo da Epic. Faça o fallback e avise o usuário que a
hierarquia nativa não estava disponível.

De qualquer forma, edite o corpo da Epic agora para preencher a seção `Issues` com os
números reais:

```bash
gh issue edit <numero-da-epic> --body-file /tmp/epic-1-final.md
```

### 7. Dependências (`blocked by`)

Só depois que **todas** as issues existirem (para já ter os números reais):

1. Para cada issue bloqueada, edite o corpo trocando os títulos por `#N` na seção
   `Blocked by` (`gh issue edit N --body-file ...`).
2. Adicione a label de bloqueio: `gh issue edit N --add-label blocked`.
3. Não adicione nada às issues sem bloqueio — a ausência da label é o sinal de "pode
   começar já", e é o que faz `is:open -label:blocked` funcionar como fila de trabalho.

Se o repositório tiver o recurso nativo de dependências de issues habilitado, use-o em
adição à convenção de corpo — nunca no lugar dela, porque o corpo é o que continua legível
para quem lê a issue pela API, por email de notificação ou em um fork.

### 8. Fechar o ciclo na Wiki

Volte na página da Wiki e preencha a seção **Plano de execução** do PRD com o link do
Milestone e a lista das Epics (`#N` + título). Sem isso, o PRD fica sendo um documento
solto e ninguém que chega pela Wiki encontra o trabalho.

## Regras de segurança nessa etapa

- **Nunca execute nada deste arquivo sem a aprovação explícita do usuário no Passo 7.**
  Se o usuário pedir mudanças depois de ver o resumo, volte e ajuste o plano — não
  publique parcialmente "para adiantar".
- **Publicar no GitHub é uma ação visível para terceiros.** Cada issue criada notifica
  watchers do repositório e não pode ser "desfeita" de verdade (issues não podem ser
  deletadas por quem não é admin — só fechadas). Confirme o `owner/repo` em voz alta antes
  do primeiro comando de escrita.
- **Nunca use `--repo` apontando para um repositório que o usuário não confirmou nesta
  conversa**, e nunca publique em repositório de terceiros/upstream a partir de um fork
  sem perguntar.
- **Idempotência:** antes de criar, verifique se já existe (milestone pelo título, issues
  por `gh issue list --search "..." --milestone "..."`). Se encontrar duplicatas parciais
  de uma execução anterior interrompida, mostre o que achou e pergunte se é para reusar ou
  criar novas — não decida sozinho.
- Se qualquer chamada falhar no meio do processo (ex: criou as Epics mas falhou nas
  Issues), pare, informe exatamente o que já foi criado (com links e números) e o que
  faltou, e pergunte como o usuário quer prosseguir. Não tente "auto-corrigir" duplicando
  ou recriando itens sem confirmação.
- Ao final, apresente um resumo com os **links reais** dos itens criados (página da Wiki,
  Milestone, Epics, Issues), não só uma repetição do plano original. Inclua o link filtrado
  da fila pronta para começar:
  `https://github.com/OWNER/REPO/issues?q=is%3Aopen+milestone%3A"Nome+da+Feature"+-label%3Ablocked`
