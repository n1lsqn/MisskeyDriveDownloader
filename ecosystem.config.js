module.exports = {
  apps: [
    {
      name: 'misskey-drive-downloader',
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3080,
      },
    },
  ],
};
