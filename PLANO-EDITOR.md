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

Até a etapa 7, o editor atual continua funcionando e é o padrão. O novo entra por uma opção, e a troca só acontece quando ele estiver completo.

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

- **`<P>` inserido pela pessoa:** vira um risco horizontal na tinta e no braille. O risco é tratado como um caractere só:
  - **Backspace** no começo da página de baixo apaga o `<P>`;
  - **Delete** no fim da página de cima também apaga.
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
