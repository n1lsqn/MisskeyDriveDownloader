import { Controller, Get, Post, Param, Res, HttpStatus } from '@nestjs/common';
import { ExportService } from './export/export.service';
import * as express from 'express';

@Controller()
export class AppController {
  constructor(private readonly exportService: ExportService) {}

  @Post('api/exports')
  async triggerExport(@Res() res: express.Response) {
    try {
      const job = await this.exportService.triggerExport();
      return res.status(HttpStatus.CREATED).json(job);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(HttpStatus.BAD_REQUEST).json({ error: msg });
    }
  }

  @Get('api/exports')
  async listJobs() {
    return this.exportService.getAllJobs();
  }

  @Get('api/exports/:id')
  async getJob(@Param('id') id: string) {
    return this.exportService.getJob(id);
  }

  @Get('api/exports/:id/download')
  async downloadExport(@Param('id') id: string, @Res() res: express.Response) {
    try {
      const job = await this.exportService.getJob(id);
      if (job.status !== 'done' || !job.downloadUrl) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .send('Export is not ready or has expired.');
      }
      return res.redirect(job.downloadUrl);
    } catch {
      return res.status(HttpStatus.NOT_FOUND).send('Export job not found.');
    }
  }

  @Get()
  getDashboard(@Res() res: express.Response) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(HttpStatus.OK).send(this.renderDashboardHtml());
  }

  private renderDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Misskey Drive Exporter</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Noto+Sans+JP:wght@300;400;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-gradient: linear-gradient(135deg, #0f0c1b 0%, #15102a 50%, #06020f 100%);
      --panel-bg: rgba(22, 17, 43, 0.45);
      --panel-border: rgba(255, 255, 255, 0.08);
      --accent-color: #7b2cbf;
      --accent-glow: rgba(123, 44, 191, 0.4);
      --success-color: #00f5d4;
      --success-glow: rgba(0, 245, 212, 0.3);
      --warning-color: #ffb703;
      --danger-color: #ff006e;
      --text-main: #f3f0fc;
      --text-muted: #a5a1b8;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', 'Noto Sans JP', sans-serif;
      background: var(--bg-gradient);
      background-attachment: fixed;
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 2rem 1rem;
      overflow-x: hidden;
    }

    .container {
      width: 100%;
      max-width: 800px;
      z-index: 10;
    }

    /* Glassmorphism Panel */
    .dashboard-panel {
      background: var(--panel-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--panel-border);
      border-radius: 24px;
      padding: 2.5rem;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 
                  0 0 40px rgba(123, 44, 191, 0.1);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .dashboard-panel:hover {
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6), 
                  0 0 50px rgba(123, 44, 191, 0.15);
    }

    header {
      text-align: center;
      margin-bottom: 2.5rem;
      position: relative;
    }

    h1 {
      font-size: 2.5rem;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(45deg, #f3f0fc, #c7a4ff, #00f5d4);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 1rem;
      font-weight: 300;
    }

    /* Primary Action */
    .action-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 3rem;
      padding-bottom: 2.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .btn-export {
      background: linear-gradient(135deg, #9d4edd 0%, #7b2cbf 100%);
      color: white;
      border: none;
      padding: 1rem 2.5rem;
      font-size: 1.1rem;
      font-weight: 600;
      border-radius: 14px;
      cursor: pointer;
      box-shadow: 0 8px 24px var(--accent-glow);
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      display: inline-flex;
      align-items: center;
      gap: 0.8rem;
    }

    .btn-export:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 30px rgba(157, 78, 221, 0.5);
    }

    .btn-export:active {
      transform: translateY(-1px);
    }

    .btn-export:disabled {
      background: #3e3a52;
      box-shadow: none;
      cursor: not-allowed;
      opacity: 0.6;
    }

    /* Jobs Section */
    .jobs-section h2 {
      font-size: 1.3rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .jobs-container {
      display: flex;
      flex-direction: column;
      gap: 1.2rem;
    }

    .job-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 16px;
      padding: 1.5rem;
      transition: all 0.25s ease;
      position: relative;
      overflow: hidden;
    }

    .job-card:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.08);
      transform: scale(1.01);
    }

    .job-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .job-id {
      font-size: 0.85rem;
      font-family: monospace;
      color: var(--text-muted);
    }

    .job-status {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      padding: 0.3rem 0.8rem;
      border-radius: 50px;
      letter-spacing: 0.5px;
    }

    .status-queued { background: rgba(165, 161, 184, 0.15); color: var(--text-muted); }
    .status-processing { background: rgba(123, 44, 191, 0.2); color: #c7a4ff; animation: pulse-status 2s infinite; }
    .status-uploading { background: rgba(255, 183, 3, 0.2); color: var(--warning-color); }
    .status-done { background: rgba(0, 245, 212, 0.15); color: var(--success-color); }
    .status-expired { background: rgba(62, 58, 82, 0.3); color: #6c757d; }
    .status-failed { background: rgba(255, 0, 110, 0.15); color: var(--danger-color); }

    /* Progress Bar */
    .progress-container {
      margin-bottom: 1rem;
    }

    .progress-info {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 0.4rem;
    }

    .progress-bar-bg {
      height: 8px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #9d4edd, #00f5d4);
      width: 0%;
      transition: width 0.4s ease;
      box-shadow: 0 0 8px rgba(157, 78, 221, 0.5);
    }

    .active-file {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-style: italic;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Actions inside Card */
    .job-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 1.2rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.03);
    }

    .expiry-info {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .btn-download {
      background: linear-gradient(135deg, #00f5d4 0%, #00bbf9 100%);
      color: #06020f;
      border: none;
      padding: 0.6rem 1.4rem;
      font-size: 0.9rem;
      font-weight: 700;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s;
      box-shadow: 0 4px 14px var(--success-glow);
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }

    .btn-download:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(0, 245, 212, 0.5);
    }

    .error-msg {
      color: var(--danger-color);
      font-size: 0.85rem;
      margin-top: 0.5rem;
      background: rgba(255, 0, 110, 0.05);
      border-left: 2px solid var(--danger-color);
      padding: 0.5rem 0.8rem;
      border-radius: 0 4px 4px 0;
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 3rem 0;
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    /* Animations */
    @keyframes pulse-status {
      0% { opacity: 0.7; }
      50% { opacity: 1; }
      100% { opacity: 0.7; }
    }

    /* Alert Banner */
    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: rgba(22, 17, 43, 0.9);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      padding: 1rem 1.5rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      transform: translateY(150%);
      transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 100;
      display: flex;
      align-items: center;
      gap: 0.8rem;
    }

    .toast.show {
      transform: translateY(0);
    }
  </style>
</head>
<body>
  <div class="container">
    <main class="dashboard-panel">
      <header>
        <h1>Misskey Drive Exporter</h1>
        <div class="subtitle">非同期一括ファイルバックアップシステム</div>
      </header>

      <section class="action-section">
        <button id="btnTriggerExport" class="btn-export" onclick="triggerExport()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          一括エクスポートを開始
        </button>
      </section>

      <section class="jobs-section">
        <h2>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          エクスポート履歴
        </h2>
        <div id="jobsList" class="jobs-container">
          <div class="empty-state">履歴を読み込んでいます...</div>
        </div>
      </section>
    </main>
  </div>

  <div id="toast" class="toast"></div>

  <script>
    let activePollInterval = null;

    async function showToast(message, isError = false) {
      const toast = document.getElementById('toast');
      toast.style.borderColor = isError ? 'var(--danger-color)' : 'var(--panel-border)';
      toast.innerHTML = \`
        <span style="color: \${isError ? 'var(--danger-color)' : 'var(--success-color)'}">
          \${isError ? '⚠️' : '✓'}
        </span>
        <span>\${message}</span>
      \`;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 4000);
    }

    async function triggerExport() {
      const btn = document.getElementById('btnTriggerExport');
      btn.disabled = true;
      try {
        const res = await fetch('/api/exports', { method: 'POST' });
        const data = await res.json();
        
        if (data.error) {
          showToast(data.error, true);
        } else {
          showToast('エクスポートジョブを開始しました！');
          fetchJobs();
        }
      } catch (err) {
        showToast('リクエストの送信に失敗しました。', true);
      } finally {
        btn.disabled = false;
      }
    }

    async function fetchJobs() {
      try {
        const res = await fetch('/api/exports');
        const jobs = await res.json();
        renderJobs(jobs);

        // If there are any active running jobs (queued, processing, uploading), start polling
        const hasActiveJobs = jobs.some(j => ['queued', 'processing', 'uploading'].includes(j.status));
        if (hasActiveJobs && !activePollInterval) {
          activePollInterval = setInterval(fetchJobs, 2000);
        } else if (!hasActiveJobs && activePollInterval) {
          clearInterval(activePollInterval);
          activePollInterval = null;
        }
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
      }
    }

    function formatDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return \`\${d.getFullYear()}/\${String(d.getMonth()+1).padStart(2,'0')}/\${String(d.getDate()).padStart(2,'0')} \${String(d.getHours()).padStart(2,'0')}:\${String(d.getMinutes()).padStart(2,'0')}\`;
    }

    function getStatusLabel(status) {
      const labels = {
        queued: '待機中',
        processing: '処理中',
        uploading: 'アップロード中',
        done: '完了',
        expired: '期限切れ',
        failed: '失敗'
      };
      return labels[status] || status;
    }

    function downloadJob(jobId) {
      window.open(\`/api/exports/\${jobId}/download\`, '_blank');
      // Briefly trigger reload to show updated downloadedAt / expiresAt
      setTimeout(fetchJobs, 1000);
    }

    function renderJobs(jobs) {
      const container = document.getElementById('jobsList');
      if (jobs.length === 0) {
        container.innerHTML = '<div class="empty-state">履歴はありません。</div>';
        return;
      }

      container.innerHTML = jobs.map(job => {
        const percentage = job.totalFiles > 0 ? Math.round((job.progress / job.totalFiles) * 100) : 0;
        const showProgress = ['processing', 'uploading'].includes(job.status);
        const isDone = job.status === 'done';
        const isFailed = job.status === 'failed';
        const isExpired = job.status === 'expired';

        let actionHtml = '';
        if (isDone) {
          actionHtml = \`
            <div class="job-actions">
              <span class="expiry-info">ダウンロード期限: \${formatDate(job.expiresAt)}</span>
              <a href="/api/exports/\${job.id}/download" target="_blank" class="btn-download">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                ダウンロード
              </a>
            </div>
          \`;
        } else if (isExpired) {
          actionHtml = \`
            <div class="job-actions">
              <span class="expiry-info" style="text-decoration: line-through;">期限切れ (\${formatDate(job.expiresAt)})</span>
            </div>
          \`;
        }

        return \`
          <div class="job-card">
            <div class="job-header">
              <span class="job-id">ID: \${job.id.substring(0, 8)}...</span>
              <span class="job-status status-\${job.status}">\${getStatusLabel(job.status)}</span>
            </div>

            \${showProgress ? \`
              <div class="progress-container">
                <div class="progress-info">
                  <span>進行状況 (\${job.progress} / \${job.totalFiles})</span>
                  <span>\${percentage}%</span>
                </div>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" style="width: \${percentage}%"></div>
                </div>
              </div>
              \${job.currentFile ? \`<div class="active-file">処理中: \${job.currentFile}</div>\` : ''}
            \` : ''}

            \${isFailed ? \`<div class="error-msg">エラー: \${job.error || '不明なエラー'}</div>\` : ''}
            
            \${actionHtml}
          </div>
        \`;
      }).join('');
    }

    // Initial load
    fetchJobs();
    // Poll list in background every 10 seconds generally
    setInterval(fetchJobs, 10000);
  </script>
</body>
</html>`;
  }
}
