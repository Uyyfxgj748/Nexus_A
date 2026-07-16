module.exports = {
  apps: [{
    name: 'nexus-bot',
    script: 'index.js',
    max_memory_restart: '600M',
    restart_delay: 5000,
    max_restarts: 15,
    min_uptime: '10s',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
