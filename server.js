const app = require('./app');
const { verifySmtpConnection } = require('./utils/mailer');

const PORT = process.env.PORT || 3000;

async function start() {
  if (!process.env.JWT_SECRET || !process.env.JWT_MFA_SECRET) {
    console.error('Missing JWT_SECRET or JWT_MFA_SECRET in .env');
    process.exit(1);
  }

  await verifySmtpConnection();
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Login: http://localhost:${PORT}/login.html`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
