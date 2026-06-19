# 🎛️ Proxmox LXC + Cloudflare Tunnel 本番デプロイガイド

Proxmox VE の LXC（Linux Containers）環境上に本システムを構築し、ルーターのポート開放をせずに **Cloudflare Tunnel (cloudflared)** を利用して安全に独自ドメインで公開する手順です。

---

## 1. Proxmox LXC コンテナ (CT) の準備

### コンテナスペック（推奨値）
* **OS**: Ubuntu 22.04 LTS または Debian 12
* **CPU**: 1〜2 vCPUs
* **RAM**: 1GB (Redis と NestJS 用に十分です)
* **Disk**: 10GB〜20GB（※SQLite DBと一時作業領域のみなので少なめでOK）

> [!IMPORTANT]
> **Docker Compose をコンテナ内で動かす場合の設定:**
> LXCコンテナの設定画面の **「Options」➔「Features」** から、**`Nesting`（入れ子）を有効化**（`nesting=1`）してください。これが無効だと、LXC内でDockerコンテナが正しく動作しません。

---

## 2. デプロイ方法の選択

コンテナのパフォーマンスを引き出す「**ネイティブ起動 (PM2)**」または、管理が容易な「**Docker Compose 起動**」のどちらかを選択します。

### パターンA: ネイティブ起動 (PM2) 【推奨：リソース消費最小】

LXCコンテナに直接 Node.js と Redis をインストールして動作させます。

#### ① 依存パッケージのインストール
```bash
# パッケージリストの更新
apt update && apt upgrade -y

# Redis のインストール
apt install redis-server -y
systemctl enable redis-server --now

# Node.js 22 (LTS) のインストール
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install nodejs -y

# PM2（プロセス管理ツール）のインストール
npm install -g pm2
```

#### ② ソースコードの配置とビルド
コンテナ内に本プロジェクトのコードを配置し、インストールとビルドを行います。
```bash
# 依存関係のインストール
npm ci

# 本番ビルドの実行
npm run build

# 本番環境設定ファイルの準備
cp .env.example .env
# .env を編集して R2 や Misskey のドメイン等の環境変数を入力します
nano .env
```

#### ③ PM2 でのプロセス起動と永続化
```bash
# PM2 での起動
pm2 start ecosystem.config.js

# コンテナ起動時にPM2が自動起動するように設定
pm2 startup
# (出力される sudo env PATH=... のコマンドをコピーして実行してください)

# 現在のプロセスリストを保存
pm2 save
```

---

### パターンB: Docker Compose 起動 【分離とポータビリティ優先】

LXC内でDockerを動かして、パッケージ化されたコンテナ群を起動します。

#### ① Docker & Docker Compose のインストール
```bash
# Docker の公式インストールスクリプト実行
curl -fsSL https://get.docker.com | sh
```

#### ② 環境構築とコンテナ起動
```bash
# 環境変数の準備
cp .env.example .env
nano .env   # R2の設定などを記述します

# 本番用 Compose をバックグラウンドで起動
docker compose -f docker-compose.prod.yml up -d
```

---

## 3. Cloudflare Tunnel (cloudflared) の構築

ルーターのポート開放（NAT）を行うことなく、Cloudflare のエッジとLXCコンテナを直接安全なトンネルで接続します。

### 設定手順（Cloudflare Zero Trust ダッシュボードを使用）

1. **Cloudflare Zero Trust にアクセス**
   * [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/) を開きます。
2. **トンネルの作成**
   * 左メニュー **「Networks」➔「Tunnels」** を選択し、**「Add a tunnel」** をクリックします。
   * トンネルタイプに **「Cloudflare」** (推奨) を選択し、任意の名前（例: `misskey-downloader-tunnel`）を付けます。
3. **LXCコンテナへのコネクタ（cloudflared）のインストール**
   * 画面上に表示されるOS（Debian / Ubuntuなど）を選択すると、インストールコマンドが表示されます。
   * そのコマンド（`curl -L ... && dpkg -i ... && cloudflared service install ...`）をコピーし、**LXCコンテナのターミナルで実行**します。
   * コネクタが正常に起動すると、ダッシュボード画面の下部に「Status: Connected」と表示されます。
4. **ルーティング設定 (Public Hostname)**
   * 「Next」を押し、Public Hostname（公開するドメイン）を設定します：
     * **Domain**: 割り当てたい独自ドメインを選択（例: `export.yourdomain.com`）
     * **Type**: `HTTP`
     * **URL**: `localhost:3080` (アプリが動作しているポート)
5. **保存**
   * **「Save tunnel」** をクリックします。

---

## 🔒 セキュリティとドメイン解決の確認

以上の設定により、`https://export.yourdomain.com` へアクセスすると、SSL（HTTPS）が適用された状態で安全にProxmox上のLXCコンテナ（ポート3080）へと接続されます。

* **SSL/TLS証明書**: Cloudflareが自動で管理・更新するため、Let's Encryptなどの個別設定は不要です。
* **ファイアウォール**: 外部からの受信ポート（80/443など）を開ける必要はありません。LXCからCloudflareへの送信接続のみで通信が確立されます。
