// pm2 로 무인 운용할 때 사용: `pm2 start ecosystem.config.cjs`
// 내부 주기 루프(npm start)를 한 프로세스로 띄운다. 크래시 시 자동 재시작.
module.exports = {
  apps: [
    {
      name: 'betman-collector',
      script: 'collect.js',
      cwd: __dirname,
      autorestart: true, // process.exit(0/1) 후 자동 재기동(무중단 회복의 최후 보루)
      max_restarts: 50,
      exp_backoff_restart_delay: 5000, // 연속 실패 시 점증 지연(핫루프 방지)
      min_uptime: 30000,
      env: { HEADLESS: 'true' },
    },
  ],
};
