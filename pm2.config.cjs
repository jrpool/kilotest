/*
  pm2.config.cjs
  PM2 process configuration for Kilotest. The .cjs extension is required: PM2
  loads configuration files with require() (Common.parseConfig in pm2's
  lib/Common.js), which cannot load ES modules. A .js or .mjs name would fail
  with ERR_REQUIRE_ESM in this type:module package.
*/
module.exports = {
  apps: [
    {
      name: 'kilotest',
      script: 'index.ts',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      time: true,
      env: {
        NODE_ENV: 'production',
        BASE_PATH: '/',
        DEMO_SSE_DELAY_MS: '100'
      }
    }
  ]
};
