# ScreenShare

Site simples para compartilhar a tela em tempo real usando WebRTC.

## O que o projeto faz

- Cria uma sala com link único.
- Captura a tela pelo navegador usando `getDisplayMedia`.
- Solicita captura de vídeo em até 60 FPS.
- Permite vários espectadores em uma mesma sala.
- Não grava a tela no servidor.
- Usa WebSocket apenas para a sinalização necessária ao WebRTC.
- Possui tela de host, tela de espectador e modo de tela cheia.

## Requisitos

- Node.js 20 ou superior.
- Um navegador moderno (Chrome, Edge ou Firefox).

## Rodar no Windows

Abra o PowerShell dentro da pasta do projeto:

```powershell
npm install
npm --prefix client install
npm --prefix server install
npm run dev
```

Depois abra:

```text
http://localhost:5173
```

## Como testar

1. Abra o site.
2. Clique em **Criar transmissão**.
3. Escolha uma tela ou janela no seletor do navegador.
4. Clique em **Compartilhar**.
5. Copie o link exibido.
6. Abra o link em outro navegador ou outro dispositivo.

Para testar em outro dispositivo na mesma rede, acesse o IP do computador na porta 5173. Exemplo:

```text
http://192.168.0.10:5173
```

O firewall do Windows pode pedir permissão para o Node.js.

## Build de produção

```powershell
npm run build
npm start
```

Depois acesse:

```text
http://localhost:3000
```

O servidor Node entrega o frontend compilado e também o endpoint WebSocket `/signal`.

## Deploy

Para internet pública, o servidor deve estar em HTTPS/WSS. O projeto já usa automaticamente `wss://` quando estiver em HTTPS.

### Importante sobre 60 FPS

O código solicita:

```ts
frameRate: {
  ideal: 60,
  max: 60,
}
```

Isso significa **até 60 FPS**. O navegador e o sistema podem reduzir a taxa real dependendo da tela, desempenho e conexão.

### Importante sobre WebRTC e NAT

O projeto inclui servidores STUN públicos para ajudar a conectar usuários pela internet. Em redes mais restritivas, algumas conexões podem exigir um servidor TURN.

Para uso público mais robusto, configure um TURN, por exemplo com `coturn`, e adicione os dados em `client/src/webrtc.ts`.

## Arquitetura

```text
Browser do host
      |
      | WebSocket (sinalização)
      v
Node.js + WebSocket
      ^
      | WebSocket (sinalização)
      |
Browser do espectador

Depois da negociação:
Host <========== WebRTC ==========> Viewer
```

O servidor não recebe o vídeo da tela neste MVP. O vídeo é transmitido pelo WebRTC entre os navegadores.

## Próximos upgrades recomendados

- TURN próprio para conexões mais confiáveis.
- Senha para salas.
- Nome personalizado para a sala.
- Chat ao vivo.
- Indicador real de FPS/bitrate.
- Seleção de qualidade (1080p/720p).
- Limite de espectadores.
- Autenticação.
- SFU (LiveKit/mediasoup) para muitas pessoas assistindo sem sobrecarregar o upload do host.
