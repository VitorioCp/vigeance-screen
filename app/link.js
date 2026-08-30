/**
 * O que pode virar uma janela deste app.
 *
 * Mora fora do `main.js` por dois motivos. O primeiro é que isto é uma
 * fronteira de segurança: o endereço vem de um campo de texto, colado de um
 * chat, e vira uma janela sem barra de endereço — quem olha para ela não tem
 * como saber o que está vendo. O segundo é consequência do primeiro: uma
 * fronteira de segurança precisa de teste, e testar o processo principal do
 * Electron custa subir um Electron.
 *
 * A regra é curta de propósito. Não cabe aqui adivinhar se o endereço é mesmo
 * de uma Sala de Tela — quem responde isso é o servidor do outro lado, e exigir
 * um domínio conhecido quebraria justamente quem hospeda no próprio domínio,
 * que é o caminho recomendado no README.
 */

/**
 * @returns {{url: URL} | {erro: string}}
 */
export function interpretarLink(bruto) {
  const texto = String(bruto ?? '').trim();
  if (!texto) return { erro: 'Cole o link do convite.' };

  let url;
  try {
    url = new URL(texto);
  } catch {
    // Sem esquema o construtor recusa, e "abc.trycloudflare.com/?t=x" é
    // exatamente o que se copia de um chat que come o https:// da frente.
    try {
      url = new URL(`https://${texto}`);
    } catch {
      return { erro: 'Isso não parece um link. Cole o endereço inteiro que te mandaram.' };
    }
  }

  // `file:` abriria arquivos desta máquina numa janela sem barra de endereço.
  // `javascript:` executaria o que estivesse escrito ali. Nenhum dos dois chega
  // de um convite legítimo, e os dois chegam de alguém tentando alguma coisa.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { erro: 'O link precisa começar com https://' };
  }

  // Um endereço sem máquina nenhuma — "https://" sozinho — passa pelo
  // construtor em alguns casos e não leva a lugar nenhum.
  if (!url.hostname) return { erro: 'Falta o endereço no link.' };

  return { url };
}
