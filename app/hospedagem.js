/**
 * Hospedar é abrir uma porta da sua máquina para o mundo, e isso leva tempo,
 * pode falhar e pode cair no meio. Este arquivo é o que faz esses três fatos
 * caberem numa tela.
 *
 * Quatro situações, e nada além delas:
 *
 *   parado ──hospedar()──► abrindo ──► no-ar ──encerrar()──► parado
 *                             │           │
 *                             └──► erro ◄─┘
 *
 * `erro` depois de `no-ar` é o caso que não se pode esconder: o túnel
 * descartável cai sozinho de vez em quando, e quando cai o link que a pessoa
 * mandou no chat para de responder. Sem este estado, a janela continuaria
 * mostrando um endereço morto como se estivesse tudo bem — e quem está do outro
 * lado veria uma página que não abre, sem ninguém para avisar.
 *
 * O `abrirTunel` chega por parâmetro, e não por import, para o teste poder
 * exercitar as quatro situações sem baixar 50 MB nem abrir porta nenhuma.
 */

// Depois que o cloudflared está de pé, o endereço sai em segundos. Se em 45
// não saiu, alguma coisa está errada de um jeito que esperar não conserta —
// é o mesmo tempo que o "start:fast" já usava.
//
// O relógio começa só depois do `abrirTunel` voltar, de propósito: é lá dentro
// que mora o download da primeira execução, e numa internet ruim ele passa
// tranquilamente de 45 segundos. Cronometrar o download junto transformaria
// "sua internet está devagar" em "deu erro".
const ESPERA_ENDERECO_MS = 45_000;

/**
 * @param {object} opcoes
 * @param {Function} opcoes.abrirTunel `abrirTunel` de scripts/tunel.mjs.
 * @param {(estado: {situacao: string, origem: string | null, erro: string | null}) => void}
 *   [opcoes.aoMudar] Chamado a cada transição, para a janela acompanhar.
 */
export function criarHospedagem({ abrirTunel, aoMudar = () => {} }) {
  let situacao = 'parado';
  let origem = null;
  let erro = null;
  let tunel = null;
  let voando = null;

  const estado = () => ({ situacao, origem, erro });

  function ir(nova, { origem: novaOrigem = null, erro: novoErro = null } = {}) {
    situacao = nova;
    origem = novaOrigem;
    erro = novoErro;
    aoMudar(estado());
  }

  /** Solta o processo do cloudflared sem deixar quem o vigiava reagir depois. */
  function soltar() {
    if (!tunel) return;
    tunel.removeAllListeners('exit');
    tunel.kill();
    tunel = null;
  }

  /**
   * Abre o endereço público. Devolve a origem.
   *
   * Chamar de novo enquanto abre devolve a mesma espera, e chamar com o túnel
   * no ar devolve o endereço que já existe — em nenhum dos dois casos um
   * segundo cloudflared sobe. A janela pode chamar sem contar as chamadas.
   */
  function hospedar({ porta, cache } = {}) {
    if (situacao === 'no-ar') return Promise.resolve(origem);
    if (voando) return voando;

    ir('abrindo');

    const tentativa = (async () => {
      const endereco = await new Promise((resolver, rejeitar) => {
        let decidido = false;
        let relogio = null;

        const decidir = (fn) => (valor) => {
          if (decidido) return;
          decidido = true;
          clearTimeout(relogio);
          fn(valor);
        };
        const ok = decidir(resolver);
        const falhou = decidir(rejeitar);

        abrirTunel({
          porta,
          cache,
          // Descartável sempre: um túnel nomeado é a configuração de quem
          // mantém um servidor no ar, e quem abriu o app não tem nem conta na
          // Cloudflare.
          rapido: true,
          // O app não tem `.env` para escrever, e não é dele o direito de
          // reconfigurar a instalação de quem também usa o projeto por
          // terminal, na mesma pasta.
          gravar: false,
          aoEndereco: (url) => (url ? ok(url) : falhou(new Error('O túnel não deu endereço.'))),
        }).then((processo) => {
          tunel = processo;

          // Cair antes de anunciar é falha de abertura; cair depois é o link
          // morrendo na mão de quem já o distribuiu. Os dois passam por aqui,
          // e o `decidido` separa um do outro.
          processo.on('exit', () => {
            if (!decidido) return falhou(new Error('O túnel fechou antes de dar o endereço.'));
            tunel = null;
            if (situacao === 'no-ar') {
              ir('erro', { erro: 'O endereço público caiu. Crie a sala de novo para reabrir.' });
            }
          });

          relogio = setTimeout(
            () => falhou(new Error('O túnel demorou demais para responder.')),
            ESPERA_ENDERECO_MS,
          );
          relogio.unref?.();
        }, falhou);
      });

      ir('no-ar', { origem: endereco });
      return endereco;
    })();

    // O que se guarda é a promessa já embrulhada, e não a de dentro: assim
    // quem chegou depois recebe exatamente o mesmo objeto de quem chegou
    // primeiro, com o mesmo tratamento de erro pendurado.
    voando = tentativa
      .catch((err) => {
        soltar();
        ir('erro', { erro: err.message });
        throw err;
      })
      .finally(() => {
        voando = null;
      });

    return voando;
  }

  function encerrar() {
    soltar();
    ir('parado');
  }

  return { estado, hospedar, encerrar };
}
