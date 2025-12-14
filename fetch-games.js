import { chromium } from 'playwright';
import { exec } from 'child_process';
import { promisify } from 'util';
import { setTimeout } from "node:timers/promises";

const execAsync = promisify(exec);
const jaVpngateProxyContainerId = "36839f8f222b";

/**
 * 指定された日付のamae-koromoページから対局URLを取得し、capture.jsを呼び出す
 * @param {string} date - YYYY-MM-DD形式の日付
 * @param {string} outputDir - ファイル保存先のパス
 */
async function fetchGamesAndCapture(date, outputDir) {
  console.log(`日付: ${date}`);
  console.log(`出力先: ${outputDir}`);
  console.log('ブラウザを起動しています...');

  const browser = await chromium.launch({
    headless: true // デバッグ用に表示
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // 対局一覧ページにアクセス
    const url = `https://amae-koromo.sapk.ch/${date}/16`;
    console.log(`\n対局一覧ページにアクセスしています: ${url}`);

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // ReactVirtualizedのテーブルが表示されるまで待機
    console.log('ページの読み込みを待機しています...');
    await page.waitForSelector('.ReactVirtualized__Table__row', { timeout: 15000 });
    console.log('対局リストが表示されました');

    // 全ての対局URLを取得
    console.log('\n対局URLを取得しています...');

    const paipuUrlsAll = [];
    while (true) {
      const gameUrls = await page.evaluate(() => {
        const urls = [];

        // ReactVirtualizedのテーブル行を取得
        const gameRows = document.querySelectorAll('.ReactVirtualized__Table__row');

        for (const row of gameRows) {
          try {
            // 各行内のリンクを探す（プレイヤー名のリンク）
            const playerLinks = row.querySelectorAll('a[title*="View game"]');

            if (playerLinks.length > 0) {
              // プレイヤーリンクがある行を記録
              urls.push({
                rowIndex: urls.length,
                hasPlayerLink: true
              });
            }
          } catch (e) {
            console.error('対局行の処理中にエラー:', e);
          }
        }

        return urls;
      });

      console.log(`${gameUrls.length}件の対局を検出しました`);

      // 各対局について処理
      const paipuUrls = [];

      for (let i = 0; i < gameUrls.length; i++) {
        // console.log(`\n[${i + 1}/${gameUrls.length}] 対局の牌譜URLを取得中...`);

        try {
          // 各対局行のプレイヤーリンクをクリック
          const paipuUrl = await page.evaluate(([index, gameUrlsLength]) => {
            const gameRows = document.querySelectorAll('.ReactVirtualized__Table__row');
            const row = gameRows[index];

            if (!row) return null;

            if (index === gameUrlsLength - 1) {
              const scrollToY = row.getBoundingClientRect().top + window.scrollY;
              window.scrollTo({ top: scrollToY, behavior: 'smooth' });
            }

            // プレイヤーリンクを見つけてクリック
            const playerLink = row.querySelector('a[title*="View game"]');
            if (!playerLink) return null;

            playerLink.click();

            // ポップアップが表示されるのを待つ（同期的には待てないので、後で待機処理を追加）
            return true;
          }, [i, gameUrls.length]);

          if (!paipuUrl) {
            console.log(`  対局 ${i + 1}: プレイヤーリンクが見つかりませんでした`);
            continue;
          }

          // ポップアップが表示されるのを待機
          await page.waitForTimeout(500);

          // ポップアップから「牌譜を見る」リンクを取得
          const gameUrl = await page.evaluate((scroll) => {
            // ポップアップ内の「牌譜を見る」リンクを探す
            // 実際のHTML構造に応じてセレクタを調整
            const modal = document.querySelector('.MuiDialog-container');

            if (!modal) return null;

            // 「牌譜を見る」リンクを探す（テキストまたはURLパターンで）
            const links = modal.querySelectorAll('a');

            for (const link of links) {
              const text = link.text.trim();
              const href = link.href;

              // 「牌譜を見る」または「牌譜」というテキストを含むリンク、
              // または5-data.amae-koromo.comを含むリンクを探す
              if (text.includes('View Game') || href.includes('5-data.amae-koromo.com')) {
                return href;
              }
            }

            return null;
          });

          if (gameUrl) {
            if (!paipuUrlsAll.includes(gameUrl)) {
              console.log(`${gameUrl}`);
              paipuUrls.push(gameUrl);
            }
          } else {
            console.log(`  対局 ${i + 1}: 牌譜URLが見つかりませんでした`);
          }

          // ポップアップを閉じる
          // await page.keyboard.down('Escape');

          // await page.waitForTimeout(500);

        } catch (error) {
          console.error(`  対局 ${i + 1}の処理中にエラー:`, error.message);
        }
      }

      let newPaipuUrlCount = 0;
      for (const paipuUrl of paipuUrls) {
        paipuUrlsAll.push(paipuUrl);
        newPaipuUrlCount++;
      }
      // console.log(`${newPaipuUrlCount}件の牌譜URLを新規取得しました`);
      if (newPaipuUrlCount === 0) {
        break;
      }
    }

    console.log(`\n合計 ${paipuUrlsAll.length}件の牌譜URLを取得しました`);

    // ブラウザを閉じる
    await browser.close();
    console.log('ブラウザを閉じました');

    // 各牌譜URLに対してcapture.jsを呼び出す
    console.log(`\ncapture.jsを呼び出しています...`);

    let successCount = 0;
    for (let i = 0; i < paipuUrlsAll.length; i++) {
      const url = paipuUrlsAll[i];
      console.log(`\n[${i + 1}/${paipuUrlsAll.length}] capture.jsを実行中: ${url}`);

      if (successCount % 30 === 0) {
        await rebootProxyServer();
        successCount = 0;
      }

      for (let retry = 0; retry < 3; retry++) {
        if (retry > 0) {
          console.log(`  ファイルが保存できなかったため、リトライします: ${retry}`);
          await rebootProxyServer();
          successCount = 0;
        }

        try {
          const command = `node capture.js "${url}" "${outputDir}"`;
          console.log(`  コマンド: ${command}`);

          const { stdout, stderr } = await execAsync(command);

          if (stdout) {
            console.log(stdout);
          }

          if (stderr) {
            console.error(`  エラー出力: ${stderr}`);
          }

          if (stdout) {
            if (stdout.includes('ファイルを保存しました')) {
              successCount++;
              break;
            }
          }
        } catch (error) {
          console.error(`  capture.jsの実行中にエラー:`, error.message);
        }
      }

      console.log(`  完了`);
    }

    console.log(`\nすべての処理が完了しました`);
    console.log(`取得した牌譜数: ${paipuUrlsAll.length}`);

  } catch (error) {
    console.error('エラーが発生しました:', error);
    await browser.close();
    throw error;
  }
}

async function rebootProxyServer() {
  console.log(`  プロキシサーバーを再起動します`);
  await execAsync(`docker restart ${jaVpngateProxyContainerId}`);

  // プロキシサーバーが起動するまで待機
  console.log('  プロキシサーバーの起動を待機しています...');
  const maxWaitTime = 600000; // 最大600秒待機
  const checkInterval = 1000; // 1sごとにチェック
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > maxWaitTime) {
      console.log('  プロキシサーバーの起動できませんでした');
      break;
    }

    const { stdout, stderr } = await execAsync(`docker logs --tail 1 ${jaVpngateProxyContainerId}`);
    const match = /before=([0-9\.]+) after=([0-9\.]+)/.exec(stdout);
    if (match && match[1] && match[2] && match[1] !== match[2]) {
      console.log(`  プロキシサーバーが起動しました: ${stdout}`);
      break;
    }

    await setTimeout(checkInterval);
  }
}

// コマンドライン引数から日付とファイル保存先を取得
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('使用方法: node fetch-games.js <日付(YYYY-MM-DD)> <ファイル保存先のパス>');
  console.error('例: node fetch-games.js 2024-12-11 ./output');
  process.exit(1);
}

const date = args[0];
const outputDir = args[1];

// 日付フォーマットの簡易検証
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('エラー: 日付はYYYY-MM-DD形式で指定してください');
  process.exit(1);
}

// メイン処理を実行
fetchGamesAndCapture(date, outputDir)
  .then(() => {
    console.log('\n処理が正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n処理中にエラーが発生しました:', error);
    process.exit(1);
  });
