# Plano: editor de faixas pareadas

## O problema de hoje

Hoje o editor tem dois lados que vivem separados:

- **Esquerda:** um `<textarea>` com quebra automática do navegador. É monoespaçado e tem mais ou menos a largura das colunas braille.
- **Direita:** a vista braille, montada pelo `formatar()` com as quebras reais (hifenização, recuo, centralização, cabeçalho e página).

Para os dois andarem juntos, o `app.js` *estima* onde cada linha de texto começa no textarea. Ele faz isso com uma div espelho (`geometriaDoTexto`), depois interpola as duas rolagens e acrescenta folgas no fim. Como o navegador quebra as linhas diferente do braille, a esquerda nunca bate linha a linha com a direita, e a interpolação só disfarça a diferença:

- uma palavra que o braille hifeniza o navegador joga inteira para a linha seguinte;
- o `<R+>` recua no braille e não na tinta;
- o centralizado sai torto;
- a troca de página não aparece na tinta.

## A ideia

**Uma única lista de linhas, e cada linha mostra os dois lados.** Quem decide onde a linha quebra é o braille, e a tinta só reflete essa decisão:

```
┌──────────────────────────────────┬──────────────────────────────────┐
│ O braille é um sistema de escri- │ ⠠⠕⠀⠃⠗⠁⠊⠇⠇⠑⠀⠿⠀⠥⠍⠀⠎⠊⠎⠞⠑⠍⠁⠀⠙⠑⠀⠑⠎⠉⠗⠊⠤ │  ← fundo azul (R+)
│   ta tátil.                      │ ⠀⠀⠞⠁⠀⠞⠁⠞⠊⠇⠄                       │  ← fundo azul (R+)
│ ━━━━━━━━━━━━━━━━━━ quebra <P> ━━━┿━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ título do livro               2  │ ⠞⠊⠞⠥⠇⠕⠀⠙⠕⠀⠇⠊⠧⠗⠕⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠼⠃ │  ← cabeçalho, só leitura
└──────────────────────────────────┴──────────────────────────────────┘
```

Rolar é uma coisa só, porque as duas metades são a mesma linha. Não sobra nenhuma geometria para estimar.

Isso é possível porque o tradutor já guarda a origem de cada cela:

- `de` e `ate`: o trecho exato do texto de onde ela veio (`motor.js`, `faixa()`);
- `linhaOrigem`: a linha do texto de origem (`pagina.js`).

A partir de cada linha braille dá para recortar o pedaço de tinta que a gerou, incluindo o hífen do corte, o recuo e o centralizado.

## Arquitetura

1. **O modelo continua sendo o texto puro.** O arquivo `.txt` é salvo exatamente como hoje, com os mesmos comandos `<R+>`, `<P>` e `<T+1>`. Nada muda no formato.
2. **Faixas** (módulo novo, `faixas.js`): uma função pura transforma o resultado do `formatar()` numa lista de linhas visuais, `{ tinta: [trechos com de/ate no texto], braille: celas, tipo, pagina }`.
   - **Tipos:** texto, comentário, cabeçalho, quebra de página (inserida ou automática) e linha em branco. Cada trecho também leva a lista de marcações ativas (R+, F- e as outras), que vira o fundo colorido.
   - **Marcações e comentários:** os códigos de marcação não ganham linha própria (ver "Decisões tomadas"). Os comentários aparecem como linhas só de tinta, com o braille vazio.
   - **Testes:** com testes de unidade, como os de hoje.
3. **Editor próprio** (substitui o textarea), no padrão dos editores de código, como o CodeMirror:
   - um `<textarea>` invisível captura teclado, acentos (incluindo teclas mortas), colar e desfazer;
   - as linhas visíveis são desenhadas a partir das faixas;
   - o cursor é uma posição no texto puro. Para desenhá-lo, o editor procura a faixa que contém essa posição;
   - setas ↑/↓ andam pelas linhas visuais, e Home/End vão ao começo e ao fim da linha visual;
   - seleção com mouse e Shift, copiar e colar, buscar e substituir: tudo opera sobre o texto puro.
4. **Reformatação incremental:**
   - ao digitar, o editor reformata a partir do parágrafo alterado e reaproveita o cache de tradução que já existe;
   - **meta:** menos de 16 ms por tecla num livro de cerca de 70 páginas;
   - **se não alcançar:** só as linhas visíveis são desenhadas (virtualização).
5. **Sai do `app.js`:** `geometriaDoTexto`, a div espelho, `mapaDeLinhas`, a interpolação de rolagem e as folgas. Esse é o código que hoje gera as dessincronias.

## Etapas

| # | Etapa | Resultado verificável |
|---|---|---|
| 1 | `faixas.js` e testes | Para o livro de exemplo, cada linha braille tem a tinta correspondente; juntar as tintas reproduz o texto original. |
| 2 | Vista pareada só de leitura | Ligada por uma opção: tinta e braille lado a lado, linha a linha, com páginas. |
| 3 | Cursor e digitação | Inserir e apagar texto, acentos, Enter e Backspace na junção de linhas, colar e desfazer. |
| 4 | Navegação e seleção | Setas, Home/End, PgUp/PgDn, Ctrl+setas, mouse, Shift e seleção entre páginas. |
| 5 | Ligar as ferramentas existentes ao novo editor | Menus, barras, Perkins, buscar, ortografia, revisor, impressão e arquivos recentes. |
| 6 | Desempenho e virtualização | Digitação fluida no livro real. |
| 7 | Remover o textarea antigo e a sincronia por estimativa | Testes verdes e verificação no navegador. |
| 8 | Palavra inteira na última linha, Finalizar e Remover quebras | No livro real: nenhuma palavra separada entre páginas; braille idêntico antes e depois de finalizar; remover devolve a paginação automática. |

Até a etapa 6, o editor antigo continuou sendo o padrão e o novo entrava pela opção "Pareado". Desde a etapa 7, o pareado é o único editor: a opção, a vista braille antiga e a sincronia por estimativa saíram.

## Decisões tomadas

**Público:** a plataforma é para pessoas videntes editarem em braille e produzirem material acessível. A acessibilidade fica no mínimo razoável: textarea oculto com rótulo, foco visível e atalhos de teclado. Leitor de tela não é foco.

**Fundo da área de edição:** cinza claro (`--papel`), com texto escuro. As barras continuam pretas e cinza, com destaques em amarelo.

**Tudo é visual.** O `.txt` continua guardando os códigos (`<R+>`, `<P>` e os outros) exatamente como hoje. O editor só mostra esses códigos de outro jeito.

### Marcações que afetam o bloco seguinte (`<R±>`, `<F±>`, `<S±>`, `<I±>`, `<T…>`, `<M…>`)

- **Sem linha própria:** a linha do código não aparece na tinta.
- **Fundo colorido:** o trecho que ela afeta, até a marcação que a desliga ou até o fim do documento, ganha uma cor de fundo atrás do texto.
- **Cores:** cada código tem a sua (por exemplo, recuo em azul-claro e sem auto-ajuste em lilás). As cores ficam em variáveis no CSS, para poderem ser ajustadas.
- **Sobreposição:** quando duas marcações valem ao mesmo tempo, as faixas se sobrepõem. A proposta é mostrar uma barra fina na margem esquerda para cada código ativo, além do fundo do mais interno.
- **Hover:** passar o mouse sobre o trecho mostra uma dica com os códigos que valem ali, por exemplo "R+ recuo de dois · F- sem auto-ajuste".
- **Criar e apagar:** por enquanto, só pelos botões da barra (R±, F±, S±, I±). Eles inserem e removem o código no texto. Apagar a marcação fica disponível na dica do hover.

### Quebra de página

- **`<P>` inserido pela pessoa:** vira um risco horizontal na tinta e no braille. É um código como os outros (ver "Comandos e comentários não ocupam linha"): Backspace e Delete encostados nele não o apagam; para tirá-lo, duplo clique no rótulo do risco e esvaziar a caixa.
- **Quebra automática** (a página encheu): também vira um risco no mesmo lugar visual. A diferença:
  - o risco automático tem um estilo mais discreto (tracejado), para distinguir do `<P>` inserido;
  - durante a edição ela é só visual e se recalcula a cada mudança;
  - **não pode ser apagada:** Backspace nela só junta com a linha anterior, como em qualquer quebra de linha.
- **Botão "Finalizar"** (menu Arquivo e barra): grava um `<P>` no `.txt` em cada quebra automática. Depois disso elas passam a ser quebras inseridas, como as da pessoa.
  - **Verificação:** o braille gerado depois de finalizar tem de ser idêntico ao de antes. Um teste automático compara os dois.
  - **Quebra no meio de um parágrafo:** o Finalizar parte a linha do texto exatamente onde o braille parte e põe o `<P>` entre as duas partes.
    - **Fora do recuo:** a continuação começa na coluna 1 e por isso não vira parágrafo novo, que só começa com dois espaços.
    - **Dentro de um trecho com recuo (`<R+>`):** a continuação recebe dois espaços no início, no começo da página seguinte. Assim ela segue a forma das outras linhas do recuo, em que toda linha depois da primeira começa com dois espaços.
- **Palavra separada na última linha da página:** não acontece. Se a separação silábica cairia na última linha de uma página, a palavra inteira vai para a página seguinte.
  - Esta é uma regra nova da paginação, que vale sempre, não só ao finalizar.
  - Com ela, o Finalizar nunca precisa escrever hífen na quebra de página.
- **Botão "Remover quebras de página":** apaga todas as linhas `<P>` do texto, sem distinguir as inseridas pela pessoa das gravadas pelo Finalizar.
  - As linhas partidas pelo Finalizar continuam partidas. Isso não muda o braille, porque a continuação na coluna 1 se junta ao parágrafo.
  - Os dois espaços acrescentados dentro do recuo podem ficar. No recuo, toda linha depois da primeira já começa com dois espaços, então eles não abrem parágrafo.
- **Ao salvar:** não finaliza sozinho. O botão deixa a pessoa escolher quando o livro está pronto.

#### Como ficou (etapa 8)

- **Exceção à palavra inteira:** quando a palavra não cabe na linha seguinte sem deixar a de cima com menos de 10 celas (o pontilhado de um sumário, por exemplo), o corte forçado continua valendo, em qualquer linha.
- **Quebra que fica automática:** o tradutor trabalha linha a linha do texto, então partir uma linha pode mudar o braille na junção (um ")" sem o "(" na mesma linha). Nesse caso, e quando o pedaço de cima teria só espaços, o Finalizar não grava aquela quebra e o aviso mostra o trecho.
- **Página em tinta:** a página automática leva a página em tinta da linha que a abriu, que pode vir de um `<nnn>` logo abaixo. Quando o valor difere do que vale no ponto do `<P>`, o Finalizar grava o `<nnn>` certo antes dele (`<0>` para tirar).
- **Continuação no recuo:** os dois espaços entram quando a primeira linha da página nova começa com os espaços que o recuo acrescenta, conferido no próprio braille.
- **Remover quebras:** pede confirmação com a contagem e avisa que leva também os `<P>` inseridos à mão.
- **Desfazer:** Finalizar e Remover trocam o texto inteiro de uma vez; o Ctrl+Z seguinte (ou Editar > Desfazer) devolve o texto de antes. O desfazer do navegador levaria uns 10 segundos num livro de 70 páginas.
- **Marca no recuo:** uma linha dentro de `<R+>` que começa com dois espaços e minúscula ganha uma barra laranja à esquerda, com dica: pode ser um parágrafo partido pelo Finalizar, e editar acima não a junta de volta.
- **Verificação:** `test_finalizar.mjs` finaliza o livro (como veio e sem nenhum `<P>`, em três medidas) e confere que o braille não muda, que não sobra quebra automática além das mantidas, que finalizar de novo não muda nada e que remover devolve o braille original.

### Cabeçalho e número da página

- Aparecem na tinta como texto normal, na linha do cabeçalho de cada página, alinhados como no braille.
- Não são editáveis: o cursor pula essas linhas.
- Para mudar o título, a pessoa usa o código `<T…>`, que aparece como marcação.

### Comentários (`<texto qualquer>`)

- Continuam visíveis só na tinta, com fundo próprio e sem braille.
- Ficam numa linha própria, porque são texto que a pessoa escreveu e precisa ler.

## Decisões em aberto

- **Paleta das marcações:** a primeira versão sai com cores provisórias para ajuste.
- **Comandos de página em tinta (`<12>`):** a proposta é mostrar como uma etiqueta discreta na margem, "pág. tinta 12", em vez de fundo, porque eles marcam um ponto e não um bloco.

## Ajustes depois da etapa 8

- **Comandos e comentários não ocupam linha, como no braille:** cada `<R+>`, `<T título>`, `<12>`, `<comentário>`... vira uma etiqueta pequena na divisa entre a linha de cima e a de baixo, no fim da metade da tinta; comandos seguidos dividem a mesma etiqueta. O braille fica corrido. Os códigos não mudam ao editar o texto:
  - o cursor não entra neles: ←/→ e ↑/↓ pulam os códigos, e um clique na etiqueta não faz nada;
  - Backspace e Delete encostados num código não fazem nada (também com Alt ou Ctrl). Numa linha em branco encostada num código, é a linha em branco que sai;
  - apagar, digitar, recortar ou colar por cima de uma seleção que pega códigos (por exemplo, entre duas páginas) tira só o texto: os códigos ficam no lugar, cada um na sua linha. O começo da primeira linha fica antes deles, e o resto da última, depois. Tudo num passo do Ctrl+Z;
  - **para alterar:** duplo clique na etiqueta (ou no rótulo do `<P>` e da nova numeração) abre a linha do código ali mesmo, na página, com moldura e o cursor no fim. Enter fecha (sem abrir linha nova), Esc fecha devolvendo o que o código tinha, e sair da linha com as setas ou o mouse também fecha. Esvaziada, a linha sai do texto junto com o código. Enquanto está aberta, Backspace no começo e Delete no fim não a juntam com as vizinhas;
  - **para mudar de lugar:** segurar a etiqueta (ou o rótulo do `<P>`) e arrastar. Uma linha amarela mostra onde ele vai cair; o código vai inteiro, numa linha só dele, antes ou depois da linha do texto apontada (nunca no meio de um parágrafo). Um passo do Ctrl+Z; depois de soltar, o cursor vai para a linha logo depois do código (a tela não sai do lugar), e depois de desfazer o cursor não fica dentro do código;
  - **para criar:** digitar o código numa linha. Enquanto o cursor está nela, a linha fica aberta; ao dar Enter (ou sair dela), vira etiqueta.
- **Aviso de redistribuir:** os `<P>` gravados não se movem sozinhos. Quando uma edição deixa a página antes de um `<P>` com menos da metade das linhas (apagou muito texto, ou o texto passou do fim e sobraram poucas linhas numa página nova), aparece uma faixa acima das páginas: "A página I ficou com 9 de 27 linhas antes de uma quebra <P>... as páginas precisam ser redistribuídas", com **Ver** (leva o cursor ao fim da página) e **×**. Páginas que já eram curtas (capa, fim de capítulo) não avisam. O aviso some quando a página volta a encher. A redistribuição em si ainda é manual.
- **A quebra de página também não ocupa linha:** é um traço colado entre a última linha da página e o cabeçalho da seguinte, com o rótulo em cima.
- **Linhas que o braille omite** (a linha em branco do topo da página, com "Elimina linhas brancas após o cabeçalho") também aparecem, em branco, na tinta.
- **"Elimina linhas brancas após o cabeçalho"** vem desligada: a linha em branco depois do cabeçalho fica no braille, como no texto.
- **Metade da tela para cada lado:** tinta (com as barras das marcações) à esquerda e braille à direita.
- **Braille do maior tamanho que cabe:** uma linha inteira de celas (as colunas da página) na metade do braille, e os pontos dentro da altura da faixa, que é a mesma da tinta. Recalculado quando a largura da tela, as colunas ou a fonte mudam (`tamanhoDoBraille` no `app.js`).
- **Enter desce o resto da linha, sem abrir parágrafo** (`aoEnter` no `cursor_pareado.js`). Com o Enter puro, a linha nova, sem espaço no começo, continuava o parágrafo de cima: o primeiro Enter não mudava nada e o segundo pulava uma linha. Agora a linha nova começa com um espaço no texto comum (vai para a margem; com um espaço a mais vira parágrafo) e com dois dentro do `<R+>` (alinhada com as outras linhas do recuo; com um a menos vira item novo). No `<F->` é só a quebra; **Shift+Enter** é a quebra pura. Digitar `<` numa linha que só tem espaços tira os espaços, para o comando começar na coluna 1.
- **Linhas vazias recebem o cursor e o destaque na tinta:** o lado da tinta ocupa a altura toda da faixa (antes encolhia, e o cursor sumia).

## Conferência com um livro revisado (Araribá Conecta Arte 6, parte 1)

A tinta gerada foi comparada linha a linha com o .docx revisado pela produção, feito a partir do braille. O que estava diferente e como ficou:

- **Interponto: verso sem cabeçalho.** Com interponto, a página par não tem linha de cabeçalho e usa as 28 linhas para o texto. Antes o verso perdia uma linha, e em livro já diagramado (um `<P>` no fim de cada página) sobrava uma página com 2 ou 3 linhas: 92 páginas em vez de 86. O verso continua numerado (`numeroTexto`), só não grava o cabeçalho (`pagina.js`, `comCabecalho`).
- **Linha vazia no `<F->` é linha em branco** no braille (o sumário perdia todas).
- **Aspas e parêntese com estado no documento inteiro**: o ")" cujo "(" ficou na linha de cima do texto não vira o parêntese de expressão numérica (que tem uma cela a menos e mudava a quebra da linha). O estado entra na chave dos caches de linha e de parágrafo (`traduzirLinhaDoTexto` e `linhasDoParagrafo` no `pagina.js`, `opcoes.estado` no `motor.js`).
- **Na tinta (Word):**
  - linha centralizada no braille vira parágrafo centralizado, sem os espaços; vale também para linha que já está no meio no `<F->` e para o cabeçalho;
  - linha separadora (só ":") vira travessões, e ":•:•:" vira "—•—•—";
  - o pontilhado do sumário ("Título ::::: 12") vira uma tabulação com pontilhado até a margem direita;
  - o grifo vale no `<F->` quando abre e fecha na mesma linha;
  - "?e" vira "è", e "×" vira a letra x;
  - a lista de símbolos braille troca o código pelo símbolo em tinta, ou pelos pontos nos sinais exclusivos do braille (tabela `LISTA_DE_SIMBOLOS` no `tinta.js`);
  - o hífen de corte dentro de um grifo sai grifado.

## Menus e barra de ferramentas

- **Barra de menus:** Arquivo, Editar, Configurar, Revisão e Ajuda. O logo e o nome Braúna ficam à esquerda, da altura das duas linhas (menus e ferramentas).
- **Editar:** desfazer, recortar, copiar, colar, localizar, substituir, selecionar tudo, os trechos sem ajuste e com recuo, centrar, minúscula/MAIÚSCULA, MAIÚSCULA/minúscula, Texto para Tabela (a refazer) e o submenu **Inserir**: símbolos especiais, página em tinta, anotação, delimitador informático, parênteses auxiliares (?*), nota de transcrição, peça orientação, quadrinhos, separador de textos e variante tipográfica.
- **Configurar:** inclui a **Codificação** (braille unificado ou antigo), que saiu da barra.
- **Revisão:** o verificador ortográfico e o dicionário (a repensar).
- **Ajuda:** a tabela de caracteres (a refazer), além de atualização, manual e sobre.
- **Barra de ferramentas (uma linha só):** centralizar e alinhar à esquerda, B e I, e os códigos `<P>`, R±, F±, S± e I±.
- **Saíram:** o menu Gráficos inteiro; de Utilitários, alto-relevo, macro-processador, retoques em braille, conversões DOS/Windows, eliminar formatações e folhear anotações. Os comandos de gráfico que já estão num texto (`<G ...>`) continuam sendo lidos pela paginação.
