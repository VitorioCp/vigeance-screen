![Como não compartilhar tela no Discord](como-nao-compartilhar-tela-no-discord-banner.png)

# Sala de Tela

Mostre sua tela para quem você quiser, por um link.

**Quem cria a sala hospeda a sala.** Você abre o app, cria uma sala, e o seu
computador vira o servidor dela. Quem vai assistir não instala nada: abre o
link no navegador e pronto.

A sala existe enquanto o app estiver aberto. Fechou, acabou — não fica nada
no ar, nem numa nuvem de ninguém.

---

## Usar

**1. Baixe o app.** O instalador do Windows está na
[página de versões](../../releases): baixe o `.exe` e execute.

> **O Windows vai reclamar na primeira vez.** Vai aparecer uma tela azul
> dizendo "O Windows protegeu o computador". Clique em **Mais informações** e
> depois em **Executar assim mesmo**.
>
> Isso acontece porque o instalador não é assinado — a assinatura é um
> certificado que custa uns US$ 200 por ano. O aviso não é sobre vírus: é o
> Windows dizendo que não conhece quem publicou.

**2. Abra o app e clique em "Criar sala."** Ele leva alguns segundos abrindo um
endereço público para o seu computador. Na primeira vez, um pouco mais: ele
baixa o `cloudflared` (uns 50 MB) e guarda para as próximas.

**3. Clique no convite, lá em cima, para copiar o link.** Mande no chat, no
grupo, onde for. Quem abrir cai direto na sua sala.

**4. Clique em "Compartilhar tela."** O seletor do Windows abre ali mesmo, na
janela do app. Escolha uma tela ou uma janela, e pronto.

### Para assistir

Nada a instalar. Abra o link que te mandaram, em qualquer navegador, em
qualquer computador. Até no celular, com sorte.

### O endereço muda

Cada vez que você abre o app e cria uma sala, o endereço é outro. O link antigo
para de funcionar. Se ele cair enquanto a sala está de pé, o convite lá em cima
fica amarelo avisando.

---

## Antes de compartilhar

**Chrome, Edge, Brave ou Opera** — só para quem vai *mostrar* a tela **pelo
navegador**, sem o app. Para *assistir*, qualquer navegador serve, e quem usa o
app não precisa de navegador nenhum.

> Não funciona no celular para compartilhar. Celular não deixa nenhum site
> capturar a tela.

---

## Rodar sem o app, pelo terminal

O app é uma casca em volta do mesmo servidor e do mesmo site que estão neste
repositório. Dá para rodar tudo direto, sem instalar app nenhum — é o caminho
de quem quer deixar a coisa no ar para várias pessoas, ou mexer no código.

Precisa do **Node.js**: baixe em [nodejs.org](https://nodejs.org), escolha a
versão **LTS** e vá clicando em avançar.

Depois, na pasta do projeto:

```
npm install
npm run start:fast
```

Esse segundo comando faz tudo sozinho: configura se faltar, monta o site, abre
o endereço público e liga o servidor, numa janela só. `Ctrl + C` derruba tudo
junto.

Para só experimentar, sem endereço público: `npm start` e abra
<http://localhost:3001> em duas janelas — crie uma sala numa, entre pela outra
e clique em **Compartilhar tela**.

---

## Usar dentro do Discord

O Discord exige que você registre o programa no site dele. É uma vez só.

Quando o `npm run start:fast` pedir, ele vai te dizer exatamente onde achar cada
valor no site do Discord, e no fim mostra **as coisas para colar lá**, já
preenchidas com os seus dados. Faça o que ele mandar.

Depois, no Discord: entre num canal de voz, clique no **foguete** 🚀 na barra de
baixo e escolha a atividade.

Dentro do Discord não existe lista de salas: quem abre a atividade cai direto na
sala daquela call, junto com o resto do pessoal que está lá.

### O endereço que muda toda vez

Por padrão o endereço público é descartável: **ele muda toda vez que você
desliga e liga o programa**. E aí a atividade para de abrir, até você ir no site
do Discord trocar o *Target* pelo endereço novo.

Para acabar com isso de vez, rode **uma única vez**:

```
npm run tunel:criar
```

Ele abre o login da Cloudflare no navegador, cria um endereço fixo, aponta o DNS
e já deixa tudo escrito na configuração. Depois disso o endereço nunca mais
muda, e você não mexe no site do Discord de novo.

> Precisa de um domínio seu já na Cloudflare. Se não tiver, siga com o
> descartável mesmo — só lembre de atualizar o *Target* quando reiniciar.

---

## Painel administrativo

O painel mostra em tempo real pessoas e servidores conectados, salas,
transmissões, banda usada pelo relay, ping, descartes, CPU, memória, disco e
informações do processo/container.

Ative o modo de desenvolvedor no Discord, clique com o botão direito na sua
conta e use **Copiar ID do usuário**. Depois acrescente ao `.env`:

```env
DISCORD_ADMIN_ID=123456789012345678
```

Reinicie o servidor e abra `https://seu-dominio.com/admin`. O painel pede login
pelo Discord e o backend compara a conta confirmada pelo próprio Discord com o
ID acima. Os endpoints não aceitam um ID enviado pelo navegador e não expõem
Client Secret, Bot Token ou Session Secret.

No Linux, o painel também lê `/proc`, cgroups e o sistema de arquivos para
mostrar tráfego de rede do host/container e limites do container. No Windows,
CPU, memória, disco e todas as métricas da aplicação funcionam; apenas os
contadores globais de rede da máquina ficam indisponíveis.

O nome de um servidor é resolvido com o Bot Token. Quando o bot não estiver
naquele servidor, o painel mostra o Guild ID sem impedir as outras métricas.

---

## Compartilhando com som

O som é sempre pedido — não há nada para ligar antes. Na janela que o navegador
abre, **escolha uma aba** e marque a caixinha de áudio que aparece lá embaixo.

### Por que só aba?

Se você escolher a tela inteira, o computador entrega **todo** o som que está
tocando — inclusive o do Discord. Aí todo mundo na call escuta a própria voz de
volta, com atraso. É insuportável em segundos.

Nenhum navegador consegue tirar um programa específico dessa captura: o som vem
misturado, é tudo ou nada. Por isso, na tela inteira o navegador nem oferece a
caixinha de áudio: a transmissão vai **sem som**.

### Quero mostrar a tela inteira E ter som

Dá. Clique na engrenagem e escolha **"Som de uma aba ou janela"**. O vídeo continua
sendo a tela inteira, e o som passa a vir da aba que você escolher — que é a
única fonte que não carrega o Discord junto.

Serve para YouTube, Twitch, jogo de navegador. Para um jogo instalado, cujo som
não está em aba nenhuma, não tem como — nem aqui nem em qualquer outro site.

Quem assiste passa o mouse no alto-falante da barra de baixo para ajustar o
volume, ou clica nele para silenciar.

> Som funciona no Chrome, Edge, Brave e Opera.

---

## Deu errado?

**A atividade não abre, ou fica só um retângulo branco**
O endereço público mudou. Vá no site do Discord em **Activities → URL Mappings**
e troque o *Target* pelo endereço que aparece na janela preta. Para isso não
acontecer nunca mais, rode `npm run tunel:criar`.

**O Windows diz que "protegeu o computador" ao abrir o instalador**
É esperado: o instalador não é assinado. Clique em **Mais informações** e depois
em **Executar assim mesmo**.

**O link que eu mandei não abre mais**
O endereço muda a cada vez que o app abre uma sala, e some quando o app fecha.
Crie a sala de novo e mande o convite novo.

**O convite ficou amarelo dizendo "Sem endereço"**
O túnel caiu. Ninguém de fora consegue entrar enquanto ele estiver assim. Volte
para a lista de salas e crie a sala de novo.

**"A porta 3001 já está sendo usada"**
Só acontece no caminho por terminal: tem outra janela do programa aberta. Feche
a outra e tente de novo. O app não passa por isso — ele pede uma porta livre ao
sistema.

**O botão de compartilhar abre uma aba e não acontece nada**
Não acontece dentro do app: lá o seletor abre na própria janela. Pelo navegador,
essa aba precisa continuar aberta enquanto você transmite. Pode voltar para o
Discord normalmente, só não feche a aba.

**"npm não é reconhecido como um comando"**
O Node.js não foi instalado, ou a janela preta foi aberta antes da instalação.
Feche a janela, abra de novo e tente outra vez. Quem usa o app não precisa de
Node nenhum.

**Não sai som**
Abra o botão ⓘ na barra de baixo e olhe a linha **Som**. Ela diz em qual dos
casos você está: sem áudio na transmissão, esperando o áudio, silenciado aí, ou
tocando.

**Quero mudar alguma configuração**
Rode `npm run configurar`. Ele lembra do que você já respondeu — é só apertar
Enter no que não mudou.

**A "Sala da call" não confere quem está no canal de voz**
Isso é opcional e só importa se você quer garantir que apenas quem está na call
consiga entrar. Precisa criar um bot no site do Discord e colar o token dele em
`DISCORD_BOT_TOKEN`, dentro do arquivo `.env`. Sem isso tudo funciona igual.

---

## Deixar no ar direto (sem seu computador ligado)

Você precisa de uma hospedagem que rode Node.js. Lá dentro:

1. Coloque o projeto e rode `npm install`.
2. Crie o arquivo `.env` com `npm run configurar`.
3. Troque, dentro do `.env`:
   - `NODE_ENV` para `production`
   - `PUBLIC_ORIGIN` para o endereço do seu site (ex: `https://tela.seusite.com`)
4. Rode `npm start`.

No site do Discord, troque o *Target* e o *Redirect* pelo endereço do seu site.
Aí nenhum túnel é necessário.

---

## Comandos, resumidos

| Comando | Para quê |
|---|---|
| `npm install` | Baixa o que o programa precisa. Só na primeira vez. |
| `npm run app` | Abre o app, com o código desta pasta. |
| `npm run app:build` | Monta o instalador do Windows, em `dist-app/`. |
| `npm run start:fast` | **Liga tudo** por terminal. Configura se faltar, e sobe numa janela só. |
| `npm run tunel:criar` | Uma vez só: cria um endereço fixo, que não muda mais. |
| `npm run configurar` | Refaz as perguntas da configuração. |
| `npm run smoke` | Confere se está tudo funcionando por dentro. |

Para quem mexe no código:

| Comando | Para quê |
|---|---|
| `npm run dev` | Site, servidor e túnel juntos, remontando a cada arquivo salvo. |
| `npm run dev:rapido` | O mesmo, mas com endereço descartável e sem tocar no `.env`. |
| `npm start` | Monta o site e sobe só o servidor, sem túnel. |
| `npm run tunel` | Só o túnel, numa janela separada. |

---

## O que ainda não dá

- **Compartilhar do celular.** Nenhum navegador de celular permite.
- **Som de programa instalado** em tela cheia. Só som de aba (veja acima).
- **Muita gente ao mesmo tempo.** Cada pessoa assistindo consome a qualidade
  escolhida, inteira. Em 2,5 Mb/s, cinco pessoas já são 12,5 Mb/s de subida; em
  8 Mb/s, são 40.
- **60 fps em qualquer computador.** Se o navegador não tiver codificação por
  hardware, ele não dá conta de 60 quadros em tela grande e entrega menos. A
  página de captura avisa quando isso acontece.
- **Mais de 4 telas ao mesmo tempo** na mesma sala.

Se você mexe em código e quer entender as decisões por trás disso,
veja [docs/como-funciona.md](docs/como-funciona.md).
