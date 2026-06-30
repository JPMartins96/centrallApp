# Central de Alarmes

Aplicacao React + TypeScript + Vite + Tauri para a central dos bombeiros.

## Modelo de funcionamento

Ha dois modos:

- **PC da central**: aplicacao Tauri instalada no Windows. E a aplicacao principal, toca os alertas, toca a radio e corre o servidor local.
- **Telemoveis / comandos remotos**: aplicacao movel com a mesma base React, usada apenas para enviar pedidos ao IP do PC da central.

O som toca sempre no PC da central. Os telemoveis nunca reproduzem os ficheiros de audio.

## Controlo remoto simples

O servidor local fica disponivel na rede interna do quartel, por defeito em:

```text
http://IP_DA_CENTRAL:8787
```

Nao ha emparelhamento, tokens por dispositivo ou lista de dispositivos autorizados. A seguranca esperada e a seguranca da propria rede interna.

Mesmo assim, a aplicacao mantem protecoes simples:

- so aceita IDs de alertas e radios conhecidos;
- nao aceita caminhos de ficheiros enviados por clientes;
- nao expoe ficheiros de audio pela API;
- rejeita pedidos fora de enderecos de rede local;
- evita repeticao acidental do mesmo alerta em menos de 1,5 s;
- nao permite dois alertas em simultaneo.

## Configuracao no PC da central

Na aplicacao Windows:

1. Abrir `Configuracoes`.
2. Ativar `Controlo remoto`.
3. Confirmar o endereco mostrado, por exemplo `http://192.168.1.20:8787`.
4. Usar esse endereco nos telemoveis.

Recomendacao operacional: configurar reserva DHCP no router para o PC da central manter sempre o mesmo IP.

## API local

Endpoints principais:

- `GET /api/health`
- `GET /api/catalog`
- `GET /api/state`
- `POST /api/alerts/{id}/play`
- `POST /api/alerts/stop`
- `POST /api/radio/play`
- `POST /api/radio/stop`
- `POST /api/radio/stations/{id}`
- `POST /api/radio/volume`
- `GET /ws`

## Politica operacional

- Um novo alerta substitui o alerta anterior.
- A radio e silenciada durante alertas e retomada no fim/paragem do alerta.
- Se a rede falhar, o telefone mostra estado offline e tenta religar WebSocket.
- A app Windows continua funcional sem rede e com servidor remoto desativado.

## Desenvolvimento

```bash
npm run build
npm run build:mobile
npm run cap:sync
cd src-tauri
cargo check
```

## Gerar instalador Windows da central

No computador Windows onde vais gerar o instalador:

```bash
npm run build:windows
```

Os instaladores ficam normalmente em:

```text
src-tauri/target/release/bundle/
```

Dependendo da configuracao Tauri, os formatos esperados sao `msi` e/ou `nsis`.

Instalar esse ficheiro no Windows da central. Depois abrir a aplicacao, ir a `Configuracoes` e ativar o servidor remoto.

A janela Windows esta configurada para abrir em fullscreen e sem redimensionamento.

## Gerar aplicacao Android/iPhone

A abordagem recomendada para os telemoveis e Capacitor, usando o modo remoto React.

Gerar build do modo remoto e sincronizar os projetos nativos:

```bash
npm run cap:sync
```

Os projetos nativos ficam em `android/` e `ios/`.

### Android

Abrir no Android Studio:

```bash
npm run cap:android
```

Para permitir chamadas `http://IP_DA_CENTRAL:8787`, no `AndroidManifest.xml` pode ser necessario ativar:

```xml
android:usesCleartextTraffic="true"
```

Depois gerar APK/AAB no Android Studio. Para instalacao interna, um APK assinado pode ser distribuido diretamente aos telemoveis do quartel.

Nota: usar JDK 17 ou JDK 21 para compilar Android. JDKs demasiado recentes podem falhar com Gradle.

### iPhone

iOS exige macOS com Xcode.

Abrir no Xcode:

```bash
npm run cap:ios
```

Para acesso a IP local por HTTP, pode ser necessario configurar `Info.plist` com permissao de rede local/ATS, por exemplo:

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>A aplicacao precisa de comunicar com o computador da central na rede interna.</string>
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsLocalNetworking</key>
  <true/>
</dict>
```

Para distribuicao interna em iPhone, usar TestFlight, Apple Business Manager/MDM ou assinatura interna conforme a conta Apple disponivel.
