# Editor ABC (HTML)

Aplicativo simples em HTML/JS para escrever, visualizar, tocar e transpor notação musical ABC usando [ABCJS](https://abcjs.net/).

## Como usar

1. Abra o arquivo `index.html` no navegador (clique duas vezes ou use um servidor estático).
2. Edite a notação ABC no painel esquerdo.
3. A partitura é renderizada e pode ser tocada no painel direito.
4. Use os controles para:
   - Ajustar a **transposição** (semitons) – afeta a visualização e o áudio.
   - Ajustar o **andamento (QPM)** do playback.
   - **Importar** arquivo `.abc`/`.txt`.
   - **Baixar** o ABC atual ou exportar a partitura em **SVG**.

## Tecnologias

- [ABCJS 6.x](https://abcjs.net/) via CDN (`abcjs-min.js`)
- HTML/CSS/JS puro (sem build)

## Observações

- A transposição visual é feita com `visualTranspose`, e o áudio utiliza `midiTranspose` do ABCJS.
- Se o áudio não tocar na primeira tentativa, interaja com a página (regra de autoplay dos navegadores) e tente novamente.