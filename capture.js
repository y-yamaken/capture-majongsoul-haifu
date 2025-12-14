import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 雀魂の牌譜URLからWebSocketメッセージをキャプチャする
 * @param {string} paipu_url - 雀魂の牌譜URL
 * @param {string} outputDir - 出力ディレクトリ名（省略可能）
 */
async function captureWebSocketMessages(paipu_url, outputDir = null) {
  console.log('ブラウザを起動しています... ');

  const browser = await puppeteer.launch({
    headless: 'new', // デバッグ用に表示
    userDataDir: './user_data_puppeteer',
    args: [
      '--proxy-server=127.0.0.1:8118',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const page = await browser.newPage();

  // WebSocketメッセージを保存する配列
  const wsMessages = [];
  let wsUrl = null;

  // Chrome DevTools Protocolを使用してWebSocketをキャプチャ
  const client = await page.target().createCDPSession();
  await client.send('Network.enable');

  // WebSocket接続の確立を監視
  client.on('Network.webSocketCreated', ({ url, requestId }) => {
    console.log(`WebSocket接続を検出: ${url}`);
    wsUrl = url;
  });

  let paipu_id = 'unknown';

  // WebSocketフレーム送信を監視
  client.on('Network.webSocketFrameSent', ({ requestId, timestamp, response }) => {
    console.log(`→ 送信: ${response.payloadData.length} bytes`);
    if (response.opcode === 2) {
      const data = Buffer.from(response.payloadData, 'base64')
      if (data.indexOf('.lq.Lobby.fetchGameRecord') > 0) {
        const match = /\+(.{43})/.exec(data);
        paipu_id = match[1];
      }
    }
  });

  // WebSocketフレーム受信を監視
  client.on('Network.webSocketFrameReceived', ({ requestId, timestamp, response }) => {
    console.log(`← 受信: ${response.payloadData.length} bytes`);
    if (response.opcode === 2) {
      const data = Buffer.from(response.payloadData, 'base64')
      if (data.indexOf('.lq.GameDetailRecords') > 0) {
        console.log(`牌譜メッセージ受信`);
        wsMessages.push({
          type: 'received',
          timestamp: new Date(timestamp * 1000).toISOString(),
          requestId: requestId,
          payloadData: response.payloadData,
          opcode: response.opcode,
          mask: response.mask
        });
      }
    }
  });

  // WebSocketエラーを監視
  client.on('Network.webSocketFrameError', ({ requestId, timestamp, errorMessage }) => {
    console.error(`WebSocketエラー: ${errorMessage}`);
  });

  // WebSocket切断を監視
  client.on('Network.webSocketClosed', ({ requestId, timestamp }) => {
    console.log('WebSocket接続が切断されました');
  });

  try {
    console.log(`牌譜URLにアクセスしています: ${paipu_url}`);
    await page.goto(paipu_url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // WebSocketメッセージが1件以上キャプチャされるまで待機
    console.log('WebSocketメッセージをキャプチャしています...');
    const maxWaitTime = 60000; // 最大60秒待機
    const checkInterval = 500; // 500msごとにチェック
    const startTime = Date.now();

    while (wsMessages.length === 0) {
      if (Date.now() - startTime > maxWaitTime) {
        console.log('タイムアウト: WebSocketメッセージが取得できませんでした');
        break;
      }
      await page.waitForTimeout(checkInterval);
    }

    if (wsMessages.length === 0) {
      console.error('WebSocketイベントのキャプチャに失敗しました');
    } else {
      console.log(`\n合計 ${wsMessages.length} 件のWebSocketイベントをキャプチャしました`);
    }

    // 出力ディレクトリを作成
    const outputPath = outputDir ? outputDir : __dirname;
    mkdirSync(outputPath, { recursive: true });
    console.log(`\n出力ディレクトリを作成しました: ${outputPath}`);

    // 各メッセージを個別のファイルに保存
    wsMessages.forEach((msg, idx) => {
      if (msg.type === 'sent' || msg.type === 'received') {
        const filename = `${paipu_id}.bin`;
        const filepath = join(outputPath, filename);

        // payloadDataをそのまま保存（バイナリの場合はBase64デコードが必要な場合がある）
        // Chrome DevTools Protocolでは、バイナリデータはBase64エンコードされている可能性がある
        let data;
        if (msg.opcode === 2) { // バイナリフレーム
          // Base64デコードしてバイナリとして保存
          data = Buffer.from(msg.payloadData, 'base64');
        } else {
          // テキストフレームはそのまま保存
          data = msg.payloadData;
        }

        writeFileSync(filepath, data);
        console.log(`ファイルを保存しました: ${filepath}`);
      }
    });

  } catch (error) {
    console.error('エラーが発生しました:', error);
    throw error;
  } finally {
    console.log('\nブラウザを閉じています...');
    await browser.close();
  }
}

// コマンドライン引数から牌譜URLを取得
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('使用方法: node capture.js <牌譜URL> [出力ディレクトリ名]');
  console.error('例: node capture.js "https://game.mahjongsoul.com/?paipu=YYMMDD-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"');
  process.exit(1);
}

const paipu_url = args[0];
const outputDir = args[1] || null;

// メイン処理を実行
captureWebSocketMessages(paipu_url, outputDir)
  .then(() => {
    console.log(`\n${new Date()} 処理が正常に完了しました`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n${new Date()} 処理中にエラーが発生しました:`, error);
    process.exit(1);
  });
