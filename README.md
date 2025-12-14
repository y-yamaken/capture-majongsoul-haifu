# 雀魂 WebSocketキャプチャツール

雀魂の牌譜URLにアクセスし、WebSocketメッセージをキャプチャして牌譜メッセージをファイルに保存するツールです。

## 機能

- 雀魂の牌譜URLから自動的にWebSocket通信をキャプチャ
- 牌譜の受信メッセージを生データ（バイナリ）形式でファイルに保存

## 必要要件

- Node.js v20 以降
- npm

## インストール

```bash
npm install
```

## 使用方法

### 基本的な使い方

```bash
node capture.js "https://game.mahjongsoul.com/?paipu=YYMMDD-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
```

### 出力ディレクトリ名を指定する場合

```bash
node capture.js "https://game.mahjongsoul.com/?paipu=YYMMDD-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" my_capture
```

### npmスクリプトを使用する場合

```bash
npm start "https://game.mahjongsoul.com/?paipu=YYMMDD-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
```

## 出力形式

キャプチャされたデータは指定したディレクトリに以下の形式で保存されます：

```
YYMMDD-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX.bin # 牌譜受信メッセージ
```

### メッセージファイル

- メッセージはバイナリファイル（`.bin`）として保存されます
- ファイル名は `牌譜ID.bin` の形式です
  - 例: `251211-117b8d55-6adc-4e5a-8f9a-f160e670ea06.bin`
- バイナリフレーム（Opcode 2）の場合、Base64デコードされた生データが保存されます
- テキストフレーム（Opcode 1）の場合、テキストがそのまま保存されます

## 動作説明

1. Puppeteerを使用してChromeブラウザを起動
2. 指定された牌譜URLにアクセス
3. Chrome DevTools Protocolを使用してWebSocket通信を監視
4. 30秒間WebSocketメッセージをキャプチャ
5. 牌譜メッセージを受信したらバイナリファイルとして保存

## 注意事項

- WebSocketメッセージのペイロードは、雀魂のAPIによってエンコードされている可能性があります（Protobufなど）
- デフォルトでは30秒間キャプチャを行います。必要に応じて `capture.js` の `waitForTimeout` の値を調整してください
- ブラウザは非ヘッドレスモード（表示あり）で起動します。ヘッドレスモードにする場合は `capture.js` の `headless` オプションを `true` に変更してください

## トラブルシューティング

### ブラウザが起動しない場合

Puppeteerが自動的にChromiumをダウンロードします。ネットワーク環境によっては時間がかかる場合があります。

### WebSocketメッセージがキャプチャされない場合

- URLが正しいか確認してください
- 待機時間を長くしてみてください（`waitForTimeout` の値を増やす）
- ネットワーク接続を確認してください

## ライセンス

MIT

## Proxyサーバーのコンテナ作成

```bash
docker create \
--cap-add=NET_ADMIN --device=/dev/net/tun \
--dns=1.1.1.1 --dns=8.8.8.8 --dns=9.9.9.9 \
-p 8118:8118 \
tantantanuki/ja-vpngate-proxy
```
