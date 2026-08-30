/**
 * A página do seletor. Desenha o que o processo principal listou e devolve o
 * id escolhido.
 *
 * Só entra em cena quando o sistema não tem seletor próprio — ver o
 * `setDisplayMediaRequestHandler` em app/main.js.
 */
const $ = (id) => document.getElementById(id);

const fontes = await window.seletor.listar();

const telas = fontes.filter((f) => f.tipo === 'tela');
const janelas = fontes.filter((f) => f.tipo === 'janela');

function desenhar(destino, secao, lista) {
  if (!lista.length) return;
  $(secao).hidden = false;

  for (const fonte of lista) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'fonte';

    const img = document.createElement('img');
    img.src = fonte.miniatura;
    img.alt = '';

    const nome = document.createElement('span');
    // textContent, nunca innerHTML: é o título de uma janela qualquer da
    // máquina, texto de terceiro como qualquer outro.
    nome.textContent = fonte.nome;
    nome.title = fonte.nome;

    botao.append(img, nome);
    botao.addEventListener('click', () => window.seletor.escolher(fonte.id));
    $(destino).append(botao);
  }
}

desenhar('telas', 'secaoTelas', telas);
desenhar('janelas', 'secaoJanelas', janelas);

$('vazio').hidden = fontes.length > 0;

$('cancelar').addEventListener('click', () => window.seletor.cancelar());

// Esc fecha, como em qualquer caixa de diálogo. Sem isto a única saída seria o
// botão, e uma janela sem barra de título não tem nem o X.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.seletor.cancelar();
});
