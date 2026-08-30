/**
 * O que substitui o `.env` dentro do app.
 *
 * Pelo terminal, a configuração é um arquivo que a pessoa edita e um assistente
 * que pergunta. Aqui não há nem uma coisa nem outra: quem baixou um instalador
 * não vai abrir um editor de texto para gerar um segredo de 32 bytes, e não
 * deveria mesmo — é a única chave que existe, ela não significa nada para
 * ninguém, e o app tem tudo de que precisa para criá-la sozinho.
 *
 * Mora na pasta de dados do usuário, e não junto do programa: um app instalado
 * fica em Arquivos de Programas, onde escrever exige administrador, e num
 * pacote asar não se escreve de jeito nenhum.
 *
 * A pasta chega por parâmetro em vez de sair de `app.getPath('userData')` aqui
 * dentro para este arquivo não depender do Electron — assim ele roda no teste
 * como roda no app.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ARQUIVO = 'config.json';

/** @returns {Record<string, unknown>} vazio quando ainda não há nada gravado. */
export function lerConfig(pasta) {
  try {
    const lido = JSON.parse(fs.readFileSync(path.join(pasta, ARQUIVO), 'utf8'));
    // Um JSON válido que não é objeto — `null`, um número, uma lista — passaria
    // pelo parse e só quebraria mais tarde, na primeira leitura de campo.
    return lido && typeof lido === 'object' && !Array.isArray(lido) ? lido : {};
  } catch {
    return {};
  }
}

/** Grava por cima do que já existe, preservando as chaves não mencionadas. */
export function gravarConfig(pasta, novos) {
  const tudo = { ...lerConfig(pasta), ...novos };
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, ARQUIVO), `${JSON.stringify(tudo, null, 2)}\n`);
  return tudo;
}

/**
 * O segredo que assina os crachás de quem entra nas salas.
 *
 * Criado na primeira execução e guardado para sempre. Trocá-lo a cada abertura
 * seria mais simples e estaria errado: o ingresso de uma sala é assinado com
 * ele, e quem tem o link de um convite aberto numa aba perderia o acesso no
 * instante em que quem hospeda reabrisse o app.
 */
export function garantirSegredo(pasta) {
  const atual = lerConfig(pasta).sessionSecret;
  if (typeof atual === 'string' && atual.length >= 32) return atual;

  const novo = crypto.randomBytes(32).toString('hex');
  gravarConfig(pasta, { sessionSecret: novo });
  return novo;
}
