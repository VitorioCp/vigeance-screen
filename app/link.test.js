import { describe, expect, it } from 'vitest';

import { interpretarLink } from './link.js';

describe('interpretar o link de um convite', () => {
  it('aceita o convite como ele sai do app', () => {
    const { url } = interpretarLink('https://abc-def.trycloudflare.com/?t=umtoken');
    expect(url.origin).toBe('https://abc-def.trycloudflare.com');
    expect(url.searchParams.get('t')).toBe('umtoken');
  });

  it('aceita http, para quem hospeda na rede local', () => {
    expect(interpretarLink('http://192.168.0.10:3001/?t=x')).toHaveProperty('url');
  });

  it('aceita domínio próprio, sem exigir trycloudflare', () => {
    expect(interpretarLink('https://tela.meusite.com/?t=x')).toHaveProperty('url');
  });

  // O chat come o https:// da frente com frequência suficiente para valer o
  // remendo — recusar aqui seria recusar o caso mais comum de todos.
  it('completa o https:// que o chat comeu', () => {
    const { url } = interpretarLink('abc.trycloudflare.com/?t=x');
    expect(url.origin).toBe('https://abc.trycloudflare.com');
  });

  it('tira o espaço em volta', () => {
    expect(interpretarLink('  https://abc.trycloudflare.com/  ')).toHaveProperty('url');
  });

  it('recusa vazio', () => {
    expect(interpretarLink('')).toHaveProperty('erro');
    expect(interpretarLink(null)).toHaveProperty('erro');
    expect(interpretarLink(undefined)).toHaveProperty('erro');
  });

  /**
   * O que este arquivo existe para barrar: uma janela sem barra de endereço
   * mostrando um arquivo desta máquina, ou executando o que estiver colado.
   */
  it('recusa file://', () => {
    expect(interpretarLink('file:///C:/Users/alguem/senhas.txt').erro).toMatch(/https/);
  });

  it('recusa javascript:', () => {
    expect(interpretarLink('javascript:alert(1)')).toHaveProperty('erro');
  });

  it('recusa data:', () => {
    expect(interpretarLink('data:text/html,<h1>oi</h1>')).toHaveProperty('erro');
  });

  it('recusa texto que não é endereço nenhum', () => {
    expect(interpretarLink('oi, entra na minha sala')).toHaveProperty('erro');
  });
});
