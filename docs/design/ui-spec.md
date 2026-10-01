# 初版GUI

参照: `monitor-concept.png`。内蔵imagegenで生成した画面案を実装基準にする。
生成指示: Japanese desktop YouTube viewer monitor / full primary screen / dark slate #101419, surface #171d24, border #2b343f, teal #5ee0c0 / URL bar / left media and events / right capture status, latest frame, reload interval, alarm test / no invented healthy metrics.

- 文字: system-ui / Hiragino Sans / Meiryo。本文14px、見出し28px、状態24px、補助12px。操作部も継承する。
- 余白: 外周28px、列間24px、パネル内18px。角丸8px、罫線1px。装飾画像は使用せず、メディアには実際の視聴画面を置く。
- 構造: アプリ名、見出しとローカル検証、URL入力、映像とインスペクター、イベント履歴、下部管理。小さいウィンドウは1列にする。
- 操作: 配信を開く、ローカル検証、取得を開始/停止、再読み込み、ライブ位置へ、自動リロード、警報音を試す、管理。
- コピー: 視聴モニター / 配信を、視聴側から確かめる。/ YouTube Live URL / 配信を開いて、映像の取得を確認 / ローカル検証でも試せます。/ 取得状態 / 未開始 / 最新の取得 / 取得回数 / 映像の変化 / 取得成功は、配信の正常判定ではありません。/ 最新の取得画像 / 未取得 / 自動リロード / イベント。
- 状態: 取得中でも配信の正常性は断定しない。取得不能、リロード中、停止を独立表示。変化率は画像全体の参考値で、フリーズ判定ではない。
- 必要な拡張: 管理画面にキャッシュ削除、CPU/メモリ、更新確認。実測値以外は — 表示。YouTubeの上にHTMLモーダルを重ねず、管理表示中はネイティブ映像ビューを隠す。
- 意図的差分: OSウィンドウ操作はネイティブタイトルバーを使う。生成画像の疑似Windowsボタンは実装しない。動的状態・操作結果・エラーは機能に必要なコピーとして追加する。
