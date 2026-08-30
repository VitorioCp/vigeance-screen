# Como funciona (para quem mexe no código)

Este arquivo existe só para explicar as decisões que não se adivinham lendo o
código. Para instalar e usar, veja o [README](../README.md).

## Por que a tela é capturada numa aba separada

Duas restrições do Discord definiram o desenho inteiro:

1. **A atividade roda num iframe de outro domínio.** Nesse contexto o navegador
   nega `getDisplayMedia()` — a função que pede a tela — a menos que o Discord
   marque o iframe com `allow="display-capture"`, o que ele não faz.
2. **WebRTC não existe em atividades.** A documentação do Discord diz que só
   WebSocket é suportado. Sem P2P, sem SFU.

Então a captura acontece **fora** do sandbox, numa aba normal do navegador, e os
quadros vão por WebSocket para o servidor, que os repassa para quem assiste:

```
QUEM MOSTRA                        SERVIDOR              QUEM ASSISTE
aba normal do navegador                                  atividade (iframe)
  getDisplayMedia  ✅                                          │
  VideoEncoder                                                 │
  └──── WebSocket binário ────►  repassa sem                   │
                                 abrir o quadro ───────────────►
                                                          VideoDecoder → canvas
```

Quem assiste nunca sai do Discord. Só quem mostra passa por uma aba.

**Dentro do app isso não vale.** A janela do Electron concede
`display-capture` a si mesma, então `getDisplayMedia()` responde e a
transmissão nasce na própria página — a aba de captura nunca chega a abrir. O
mesmo `broadcastFromHere()` que quase sempre falha no iframe é o caminho
normal lá. Ver "O app", mais abaixo.

Se um dia o Discord conceder `display-capture`, o botão **"Testar captura no
iframe"** (no painel de detalhes) passa a funcionar — e aí a aba externa pode
sumir. A atividade já tenta capturar internamente antes de cair para a aba.

## Por que WebCodecs e não MediaRecorder

A primeira versão usava `MediaRecorder` + Media Source Extensions e ficava em
~3 segundos de atraso. O formato de container impõe um piso: o pedaço só sai
depois de fechado, e o player precisa acumular buffer para não engasgar.

WebCodecs elimina os dois. Cada quadro é codificado, enviado e desenhado
individualmente, sem container. E, ao contrário de `display-capture`, WebCodecs
não é bloqueado dentro do iframe.

## Keyframe sob demanda

Quem chega no meio de uma transmissão não consegue decodificar nada até receber
um quadro completo. Em vez de guardar um antigo, o servidor **pede um novo** ao
transmissor quando alguém começa a assistir — a tela aparece em ~1 quadro.

O servidor também barra quadros incompletos para quem ainda não recebeu um
completo: alimentar um decodificador frio com eles só produz erro.

## Assistir é opt-in

O servidor não manda os quadros de uma tela para ninguém que não tenha pedido
explicitamente. É o que segura a banda: filtrar só na exibição gastaria a mesma
saída de rede. Por isso cada tela aparece primeiro como um convite
("Assistir tela") em vez de já começar a tocar.

## Salas

- **No Discord:** não há lista. A atividade entra direto na sala daquela call.
  Com `DISCORD_BOT_TOKEN` configurado, o servidor confirma com o Discord quem
  está no canal de voz; sem ele, o escopo é a instância da atividade.
- **No site:** não existe call para herdar, então a lista de salas é a única
  forma de as pessoas se encontrarem. Salas podem ter senha.

Salas vivem em memória e fecham sozinhas 12 segundos depois de esvaziar — a
carência existe porque recarregar a página desconecta e reconecta.

## Som

O áudio vai pelo mesmo socket e pelo mesmo cabeçalho do vídeo, distinguido só
pelo byte de tipo. Opus a 96 kbps, capturado junto com a tela por
`getDisplayMedia({ audio: { systemAudio: 'include' } })`.

**O som só sai de aba.** Compartilhar a tela inteira entrega a mistura do
sistema, com a saída do Discord dentro — e a call inteira passa a se ouvir de
volta. Não existe API para tirar um processo dessa mistura: o áudio é capturado
por processo e a relação com uma janela não é um-para-um. O que dá para saber é
o `displaySurface` escolhido, e isso basta — `browser` significa som daquela
aba só. Nos outros casos a faixa é parada antes de sair da máquina.

Junto vai `restrictOwnAudio` quando o navegador suporta: ele tira da captura o
que a própria página está tocando, senão quem transmite enquanto assiste devolve
o som da outra tela para a sala, em laço.

Três coisas que o desenho assume:

- **Áudio não tem keyframe.** Cada pacote Opus se decodifica sozinho, então ele
  não passa pelo bloqueio que barra vídeo sem ponto de partida. Se passasse,
  quem entra no meio ficaria mudo até o próximo keyframe.
- **Buraco em áudio é audível.** Um quadro de vídeo perdido não se nota; um
  intervalo sem amostra é um estalo. Por isso a reprodução mantém um colchão de
  80 ms — o som toca um pouco atrás do vivo, e essa folga absorve o solavanco
  da rede. Passando de 320 ms acumulados, corta e volta ao vivo: atraso somado
  não se recupera sozinho.
- **Sincronia é aceitável, não exata.** O vídeo é desenhado assim que chega; o
  som carrega o colchão. A diferença fica em algumas dezenas de milissegundos,
  abaixo do que se percebe em tela de computador. Casar os dois exigiria
  atrasar o vídeo até o áudio — mais latência para resolver um problema que não
  aparece fora de rosto falando.

A reprodução agenda cada pedaço num `AudioBufferSourceNode`, sem AudioWorklet.
O worklet daria precisão por amostra, mas exige um arquivo carregado por URL, e
dentro da atividade toda URL passa pelo proxy do Discord — um caminho a mais
para dar errado, em troca de precisão que pacotes de 20 ms não pedem.

## Protocolo

Cada pacote trafega como binário puro:

```
[1B slot][1B tipo: 1=vídeo completo 2=vídeo parcial 3=som][8B tempo][8B relógio][payload]
```

O `slot` é o número do transmissor, carimbado na origem: o servidor repassa o
buffer sem tocar nele, e quem assiste sabe para qual decodificador mandar. Até
4 transmissores por sala.

O relógio de envio serve só para medir atraso. É exato na mesma máquina; entre
máquinas diferentes, aproximado.

Controle vai em JSON: `start`, `config`, `audio-config`, `stop`
(transmissor → servidor); `state`, `stream-start`, `config`, `audio-config`,
`stream-stop`, `need-keyframe`, `error` (servidor → clientes).

## Detalhes que não são acidentais

- **`latencyMode: 'realtime'`** no codificador e **`optimizeForLatency: true`**
  no decodificador. Sem eles, ambos acumulam quadros antes de emitir — comprime
  melhor, mas é atraso que nunca mais sai.
- **`frame.close()`** depois de desenhar. `VideoFrame` segura memória de GPU;
  sem isso a aba trava em segundos.
- **Descartar quadro quando a fila do codificador passa de 2.** Fila vira
  atraso permanente. Melhor perder um quadro do que carregar o atraso.
- **`track.contentHint = 'text'`.** Avisa que é tela, não vídeo — mantém texto
  nítido em vez de suavizar bordas.
- **Backpressure no relay.** Se o socket de alguém acumula mais de 2 MB, o
  servidor descarta quadros para essa pessoa em vez de enfileirar. Sem isso, um
  espectador com internet ruim derruba o processo por consumo de memória.
- **`/.proxy/`** em todo fetch e WebSocket feito de dentro da atividade — é
  assim que o Discord roteia para o seu servidor.
- **Client ID vem do servidor, não do build.** Embutir no bundle obrigava a
  rebuildar a cada troca de credencial, e esquecer disso não dava erro: a
  atividade abria e só quebrava no login.

## O app

O app existe para inverter quem hospeda. Pelo terminal, uma pessoa liga o
servidor e ele serve todo mundo; no app, cada pessoa que cria uma sala hospeda
a sua. Isso não pediu um servidor novo — pediu uma casca que ligue o que já
existe, e que saiba quando abrir o túnel.

```
app/main.js ──fork──► server/index.js   (porta 0, o sistema escolhe)
     │                      ▲
     │                      │ { tipo: 'origem' }
     └──abrirTunel──► cloudflared ──► https://…trycloudflare.com
```

**O servidor roda num processo separado.** Ele chama `process.exit()` quando o
arranque dá errado, e no mesmo processo isso fecharia a janela sem nada na
tela. É `fork` e não `spawn` porque o canal de mensagens vem junto — e é por
ele que o endereço do túnel chega depois.

**O endereço público virou variável.** O `PUBLIC_ORIGIN` era lido uma vez, no
arranque, e o `start:fast` resolvia esperando o túnel para só então subir o
servidor. Num app isso é uma tela de espera antes de qualquer coisa — na
primeira execução, com 50 MB de `cloudflared` para baixar no meio. Então o
servidor sobe na hora, em localhost, e recebe o endereço quando ele nascer.

Escolhido um canal de `fork` em vez de uma rota HTTP de propósito: uma rota
precisaria de um segredo para não deixar qualquer um na rede local reescrever
de onde saem os convites, e um segredo a mais é uma coisa a mais para guardar,
girar e vazar. O canal já é privado ao par pai/filho e não escuta em porta
nenhuma.

**A ordem na criação da sala não é intercambiável.** O túnel primeiro, a sala
depois. O convite é carimbado com o endereço que existir no instante em que ele
é emitido, e uma sala criada antes do túnel produz um link para `127.0.0.1` —
que não dá erro nenhum: abre uma página em branco na casa da outra pessoa.

**Porta 0.** Quem escolhe é o sistema. "A porta 3001 já está sendo usada" era o
tropeço mais comum do caminho por terminal, e no app ele deixa de existir.

**Nada de `.env`.** Quem baixou um instalador não vai abrir um editor de texto
para gerar um segredo de 32 bytes. O `SESSION_SECRET` nasce na primeira
execução e fica na pasta de dados do usuário — e fica, em vez de ser sorteado a
cada abertura, porque o ingresso de uma sala é assinado com ele: trocá-lo
invalidaria todo link já distribuído.

**Sem asar.** O empacotamento normal do Electron junta o programa num arquivo
só que só o processo do Electron sabe ler — e o servidor aqui é um processo
novo, que não herda esse leitor. Com asar ligado, a janela abre e o servidor
morre dizendo que não achou `server/index.js`. Contornar exigiria desempacotar
`server/`, `shared/` e `node_modules` inteiros, que é tudo o que existe.

**As dependências do servidor moram no `package.json` da raiz.** É de lá que o
electron-builder monta a árvore do que empacotar — do arquivo onde está o
`main`. Declaradas só no workspace de `server/`, `express`, `ws` e `dotenv`
não entravam no instalador, e o erro só aparecia na máquina de quem instalasse.

## Estrutura

```
server/
  index.js        HTTP + WebSocket, login do Discord, emissão de tokens
  rooms.js        salas e repasse dos quadros
  tokens.js       tokens assinados (sem biblioteca externa)
  public/share.*  a aba de captura, que roda FORA do Discord
client/
  src/main.js     interface da sala e conexão
  src/player.js   decodifica os quadros e desenha no canvas
  src/audio.js    decodifica o som e agenda a reprodução
shared/
  broadcaster.js  captura + codificação, usada pela aba e pela atividade
scripts/
  configurar.mjs  assistente de configuração
  tunel.mjs       sobe o túnel e grava o endereço no .env
  smoke.mjs       teste do servidor ponta a ponta, sem navegador
app/
  main.js         processo principal do Electron: janela, IPC, captura de tela
  servidor.js     sobe o server/ num processo filho e conversa com ele
  hospedagem.js   as quatro situações do endereço público
  config.js       o que substitui o .env dentro do app
  preload.cjs     a ponte entre a janela e o processo principal
  seletor/        escolher tela ou janela, onde o sistema não tem o seu
```

## Testes

```
npm start        # numa janela
npm run smoke    # noutra
```

Cobre autenticação, senha de sala e bloqueio por tentativas, a máquina de
estados do keyframe, "assistir é opt-in", vários transmissores sem misturar os
streams, e isolamento entre salas e instâncias.

## Rodando enquanto mexe no código

`npm start` reconstrói o site a cada execução. Para recarregar sozinho a cada
salvamento, use `npm run dev` — ele sobe o servidor na 3001 e o site na 5173,
e é a 5173 que você abre.
