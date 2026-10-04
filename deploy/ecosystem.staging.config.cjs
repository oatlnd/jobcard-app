// PM2 processes for the TEST SITE (staging). Used automatically by deploy/update.sh
// when server/.env contains DEPLOY_ENV=staging. Names differ from the live site so both can run.
const path = require('path');
const server = path.join(__dirname, '..', 'server');

module.exports = {
  apps: [
    {
      name: 'jobcard-staging-api',
      cwd: server,
      script: 'src/index.js',
      instances: 1,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production', DEPLOY_ENV: 'staging' },
      time: true,
    },
    {
      name: 'jobcard-staging-worker',
      cwd: server,
      script: 'src/worker.js',
      instances: 1,
      max_memory_restart: '150M',
      env: { NODE_ENV: 'production', DEPLOY_ENV: 'staging', AUTO_MIGRATE: 'false' },
      time: true,
    },
  ],
};
