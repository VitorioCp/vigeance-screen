/**
 * Sobe o servidor de verdade, do mesmo jeito que o app sobe.
 *
 * Vale mais do que um `fork` de mentira: o que este arquivo precisa provar é
 * que o processo filho anuncia a porta que o sistema deu e que o endereço
 * público do convite muda quando o túnel avisa — e as duas coisas são código do
 * `server/index.js`, não daqui.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { subirServidor } from './servidor.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEGREDO = 'a'.repeat(64);

let servidor = null;

afterEach(() => {
  servidor?.encerrar();
  servidor = null;
});

/** Um convite recém-emitido, que é onde o endereço público aparece. */
async function criarSala(porta) {
  const base = `http://127.0.0.1:${porta}`;

  const sessao = await fetch(`${base}/api/session-guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Teste' }),
  }).then((r) => r.json());

  return fetch(`${base}/api/rooms/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: sessao.identity, name: 'Sala' }),
  }).then((r) => r.json());
}

describe('servidor dentro do app', () => {
  it('sobe numa porta livre, anuncia qual foi e responde', async () => {
    servidor = await subirServidor({ raiz: RAIZ, segredo: SEGREDO });

    expect(servidor.porta).toBeGreaterThan(0);
    // Porta 0 é o que se pede; o que se recebe é sempre outra coisa.
    expect(servidor.porta).not.toBe(0);

    const saude = await fetch(`http://127.0.0.1:${servidor.porta}/api/health`).then((r) =>
      r.json(),
    );
    expect(saude).toEqual({ ok: true });
  }, 30_000);

  it('duas instâncias convivem, cada uma na sua porta', async () => {
    servidor = await subirServidor({ raiz: RAIZ, segredo: SEGREDO });
    const outro = await subirServidor({ raiz: RAIZ, segredo: SEGREDO });

    try {
      expect(outro.porta).not.toBe(servidor.porta);
    } finally {
      outro.encerrar();
    }
  }, 30_000);

  /**
   * O motivo de o canal existir. Sem ele o convite nasceria apontando para
   * 127.0.0.1, que não abre em computador nenhum além do de quem hospeda.
   */
  it('passa a emitir convites com o endereço do túnel depois de avisado', async () => {
    servidor = await subirServidor({ raiz: RAIZ, segredo: SEGREDO });

    const antes = await criarSala(servidor.porta);
    expect(antes.shareUrl).toMatch(/^http:\/\/127\.0\.0\.1\//);

    // Barra no fim de propósito: é o que o cloudflared costuma anunciar, e uma
    // barra sobrando vira "//share.html" no convite.
    servidor.avisarOrigem('https://teste.trycloudflare.com/');

    // A mensagem atravessa o canal do fork, então o efeito não é imediato.
    let depois;
    for (let tentativa = 0; tentativa < 50; tentativa++) {
      depois = await criarSala(servidor.porta);
      if (depois.shareUrl.startsWith('https://')) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(depois.shareUrl).toMatch(/^https:\/\/teste\.trycloudflare\.com\/share\.html\?t=/);
  }, 30_000);

  it('avisa quando o servidor não sobe', async () => {
    await expect(
      subirServidor({ raiz: path.join(RAIZ, 'nao-existe'), segredo: SEGREDO }),
    ).rejects.toThrow();
  }, 30_000);
});
