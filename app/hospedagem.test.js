import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { criarHospedagem } from './hospedagem.js';

/** Um cloudflared de mentira: anuncia o que mandarem e morre quando pedirem. */
function tunelFalso() {
  const processo = new EventEmitter();
  processo.kill = vi.fn(() => processo.emit('exit', 0));
  return processo;
}

/**
 * @param {object} roteiro
 * @param {string} [roteiro.endereco] O que o túnel anuncia. Ausente = silêncio.
 * @param {Error} [roteiro.falhaAoAbrir] O cloudflared nem sobe.
 */
function abrirTunelFalso({ endereco, falhaAoAbrir } = {}) {
  const processo = tunelFalso();
  const fn = vi.fn(async ({ aoEndereco }) => {
    if (falhaAoAbrir) throw falhaAoAbrir;
    if (endereco !== undefined) aoEndereco(endereco);
    return processo;
  });
  fn.processo = processo;
  return fn;
}

describe('hospedagem', () => {
  it('começa parada', () => {
    const h = criarHospedagem({ abrirTunel: abrirTunelFalso() });
    expect(h.estado()).toEqual({ situacao: 'parado', origem: null, erro: null });
  });

  it('vai a no-ar com o endereço que o túnel anunciou', async () => {
    const mudancas = [];
    const h = criarHospedagem({
      abrirTunel: abrirTunelFalso({ endereco: 'https://abc.trycloudflare.com' }),
      aoMudar: (e) => mudancas.push(e.situacao),
    });

    await expect(h.hospedar({ porta: 4321 })).resolves.toBe('https://abc.trycloudflare.com');
    expect(h.estado()).toMatchObject({
      situacao: 'no-ar',
      origem: 'https://abc.trycloudflare.com',
    });
    expect(mudancas).toEqual(['abrindo', 'no-ar']);
  });

  it('repassa porta e cache, e nunca escreve no .env nem usa túnel fixo', async () => {
    const abrirTunel = abrirTunelFalso({ endereco: 'https://x.trycloudflare.com' });
    const h = criarHospedagem({ abrirTunel });

    await h.hospedar({ porta: 5555, cache: '/tmp/cache' });

    expect(abrirTunel).toHaveBeenCalledWith(
      expect.objectContaining({ porta: 5555, cache: '/tmp/cache', rapido: true, gravar: false }),
    );
  });

  it('com o túnel no ar, hospedar de novo não sobe um segundo', async () => {
    const abrirTunel = abrirTunelFalso({ endereco: 'https://x.trycloudflare.com' });
    const h = criarHospedagem({ abrirTunel });

    await h.hospedar();
    await expect(h.hospedar()).resolves.toBe('https://x.trycloudflare.com');
    expect(abrirTunel).toHaveBeenCalledTimes(1);
  });

  it('duas chamadas ao mesmo tempo compartilham a mesma abertura', async () => {
    const abrirTunel = abrirTunelFalso({ endereco: 'https://x.trycloudflare.com' });
    const h = criarHospedagem({ abrirTunel });

    const [a, b] = await Promise.all([h.hospedar(), h.hospedar()]);

    expect(a).toBe(b);
    expect(abrirTunel).toHaveBeenCalledTimes(1);
  });

  it('cai em erro quando o cloudflared não sobe', async () => {
    const h = criarHospedagem({
      abrirTunel: abrirTunelFalso({ falhaAoAbrir: new Error('sem internet') }),
    });

    await expect(h.hospedar()).rejects.toThrow('sem internet');
    expect(h.estado()).toMatchObject({ situacao: 'erro', erro: 'sem internet', origem: null });
  });

  it('cai em erro quando o túnel fecha antes de anunciar', async () => {
    const abrirTunel = abrirTunelFalso();
    const espera = criarHospedagem({ abrirTunel });
    const promessa = espera.hospedar();

    // Deixa o `abrirTunel` resolver antes de matar o processo — é a ordem real.
    await Promise.resolve();
    abrirTunel.processo.emit('exit', 1);

    await expect(promessa).rejects.toThrow('antes de dar o endereço');
    expect(espera.estado().situacao).toBe('erro');
  });

  it('depois de um erro, hospedar tenta de novo', async () => {
    let vez = 0;
    const processo = tunelFalso();
    const abrirTunel = vi.fn(async ({ aoEndereco }) => {
      if (vez++ === 0) throw new Error('primeira falhou');
      aoEndereco('https://segunda.trycloudflare.com');
      return processo;
    });

    const h = criarHospedagem({ abrirTunel });
    await expect(h.hospedar()).rejects.toThrow('primeira falhou');
    await expect(h.hospedar()).resolves.toBe('https://segunda.trycloudflare.com');
    expect(h.estado().situacao).toBe('no-ar');
  });

  /**
   * O caso que justifica o estado `erro` existir depois do `no-ar`: o link já
   * está no chat de alguém quando o túnel cai.
   */
  it('avisa quando o endereço cai depois de já estar no ar', async () => {
    const abrirTunel = abrirTunelFalso({ endereco: 'https://x.trycloudflare.com' });
    const h = criarHospedagem({ abrirTunel });

    await h.hospedar();
    abrirTunel.processo.emit('exit', 1);

    expect(h.estado()).toMatchObject({ situacao: 'erro', origem: null });
    expect(h.estado().erro).toMatch(/caiu/);
  });

  it('encerrar mata o cloudflared e volta a parado, sem virar erro', async () => {
    const abrirTunel = abrirTunelFalso({ endereco: 'https://x.trycloudflare.com' });
    const h = criarHospedagem({ abrirTunel });

    await h.hospedar();
    h.encerrar();

    expect(abrirTunel.processo.kill).toHaveBeenCalled();
    expect(h.estado()).toEqual({ situacao: 'parado', origem: null, erro: null });
  });

  it('encerrar parada não quebra', () => {
    const h = criarHospedagem({ abrirTunel: abrirTunelFalso() });
    expect(() => h.encerrar()).not.toThrow();
    expect(h.estado().situacao).toBe('parado');
  });

  it('desiste quando o túnel sobe e nunca anuncia endereço', async () => {
    vi.useFakeTimers();
    try {
      const h = criarHospedagem({ abrirTunel: abrirTunelFalso() });
      // A expectativa é pendurada antes de o relógio andar de propósito: quem
      // adianta o tempo faz a promessa falhar na hora, e sem um `catch` já no
      // lugar o Node contabiliza uma rejeição não tratada — barulho que faria
      // este arquivo inteiro parecer quebrado.
      const promessa = h.hospedar();
      const esperado = expect(promessa).rejects.toThrow('demorou demais');

      // Duas voltas: uma para o `abrirTunel` resolver, outra para o `then` que
      // arma o relógio.
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(45_000);

      await esperado;
      expect(h.estado().situacao).toBe('erro');
    } finally {
      vi.useRealTimers();
    }
  });
});
