// PM2 process file.  Start with:  pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'jobcard-api',
      cwd: './server',
      script: 'src/index.js',
      instances: 1, // keep 1: Socket.IO live updates are in-memory
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
      time: true,
    },
    {
      name: 'jobcard-worker',
      cwd: './server',
      script: 'src/worker.js',
      instances: 1, // safe to run more - jobs are claimed with SKIP LOCKED
      max_memory_restart: '200M',
      env: { NODE_ENV: 'production', AUTO_MIGRATE: 'false' },
      time: true,
    },
  ],
};
