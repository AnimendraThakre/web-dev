require('dotenv').config();
const app = require('./app');
const { validateEnv } = require('./config/env');
const { logSmtpStatus } = require('./utils/mailer');

const PORT = process.env.PORT || 3000;

async function start() {
  const { valid } = validateEnv({ exitOnError: true });
  if (!valid) return;

  app.listen(PORT, () => {
    logSmtpStatus();
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Login: http://localhost:${PORT}/login.html`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
