import { execSync } from 'child_process';

module.exports = async function globalSetup() {
  // In CI the DB is provisioned by the workflow; locally you can use
  // docker compose up -d postgres redis before running e2e tests.
  if (process.env.NODE_ENV === 'test' && process.env.DATABASE_URL) {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  }
};
