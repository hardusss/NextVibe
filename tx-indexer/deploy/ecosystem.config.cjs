module.exports = {
  apps: [
    {
      name: "tx-indexer",
      script: "src/index.ts",
      interpreter: "bun",
      cwd: __dirname + "/..",
      env: {
        NODE_ENV: "production",
      },
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
    },
  ],
};
