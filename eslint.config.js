/**
 * Lint do workspace inteiro, num arquivo só.
 *
 * O projeto roda em dois mundos e o mesmo `.js` significa coisas diferentes em
 * cada um: `server/`, `scripts/` e `app/` são Node, `client/src/`,
 * `server/public/`, `shared/` e `app/seletor/` são navegador. Sem essa
 * separação o `no-undef` fica inútil — ou acusa `window` no servidor, ou deixa
 * passar `process` no cliente, que é justamente o erro que ele existe para
 * pegar.
 *
 * O app é o caso onde a fronteira passa dentro da mesma pasta: o processo
 * principal do Electron é Node puro, e o `app/seletor/` é uma página. O
 * `preload` fica no meio — roda em Node, mas conversa com a página — e é o
 * único arquivo CommonJS do projeto, porque preload em sandbox não aceita
 * módulo ES.
 */
import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  // dist-app/ é o app empacotado: uma cópia inteira de server/, app/ e do site
  // dentro de um Electron. Linteá-la é linteá-los duas vezes, com o agravante
  // de que ali dentro nem a configuração de globais bate.
  globalIgnores(['client/dist/', 'dist-app/', 'coverage/', '.cache/', 'site/']),

  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      // Argumento que sobra depois de uma assinatura mudar é resto; o `_` na
      // frente é como se diz "este eu sei que não uso".
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  {
    files: [
      'server/**/*.js',
      'scripts/**/*.mjs',
      'app/**/*.js',
      'client/vite.config.js',
      'vitest.*.js',
    ],
    ignores: ['server/public/**', 'app/seletor/**'],
    languageOptions: { globals: globals.node },
  },

  // O preload é o único lugar do projeto onde os dois mundos coexistem de
  // verdade: ele roda com `require` e `process`, e ao mesmo tempo enxerga o
  // `location` da página que está prestes a carregar.
  {
    files: ['app/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
  },

  {
    files: ['client/src/**/*.js', 'server/public/**/*.js', 'shared/**/*.js', 'app/seletor/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
  },

  // Por último: desliga o que o Prettier já decide. Duas ferramentas opinando
  // sobre a mesma vírgula é conflito, não verificação dobrada.
  prettier,
]);
