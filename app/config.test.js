import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { garantirSegredo, gravarConfig, lerConfig } from './config.js';

let pasta;

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'sala-config-'));
});

afterEach(() => {
  fs.rmSync(pasta, { recursive: true, force: true });
});

describe('config do app', () => {
  it('lê vazio quando ainda não há arquivo', () => {
    expect(lerConfig(pasta)).toEqual({});
  });

  it('lê vazio quando o arquivo está corrompido, em vez de explodir', () => {
    fs.writeFileSync(path.join(pasta, 'config.json'), '{ isto não é json');
    expect(lerConfig(pasta)).toEqual({});
  });

  it('lê vazio quando o JSON é válido mas não é um objeto', () => {
    fs.writeFileSync(path.join(pasta, 'config.json'), 'null');
    expect(lerConfig(pasta)).toEqual({});
  });

  it('grava preservando o que já estava lá', () => {
    gravarConfig(pasta, { a: 1 });
    gravarConfig(pasta, { b: 2 });
    expect(lerConfig(pasta)).toEqual({ a: 1, b: 2 });
  });

  it('cria a pasta quando ela ainda não existe', () => {
    const nova = path.join(pasta, 'fundo', 'do', 'poco');
    gravarConfig(nova, { a: 1 });
    expect(lerConfig(nova)).toEqual({ a: 1 });
  });

  it('gera um segredo longo o bastante para o servidor aceitar', () => {
    const segredo = garantirSegredo(pasta);
    // 32 é o piso que o servidor exige; o gerado tem 64 (32 bytes em hex).
    expect(segredo).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * O que está em jogo: o ingresso de uma sala é assinado com este segredo.
   * Trocá-lo a cada abertura invalidaria todo link já distribuído.
   */
  it('devolve o mesmo segredo nas próximas aberturas', () => {
    expect(garantirSegredo(pasta)).toBe(garantirSegredo(pasta));
  });

  it('substitui um segredo curto demais, gravado por engano', () => {
    gravarConfig(pasta, { sessionSecret: 'curto' });
    expect(garantirSegredo(pasta)).toHaveLength(64);
  });
});
