// pm2 로 무인 운용할 때 사용: `pm2 start ecosystem.config.cjs`
// 내부 주기 루프(npm start)를 한 프로세스로 띄운다. 크래시 시 자동 재시작.
module.exports = {
  apps: [
    {
      name: 'betman-collector',
      script: 'collect.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 30000,
      env: { HEADLESS: 'true' },
    },
  ],
};
