module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '@app/(.*)': '<rootDir>/../src/$1',
  },
  globalSetup: './setup/global-setup.ts',
  globalTeardown: './setup/global-teardown.ts',
  testTimeout: 60000,
};
