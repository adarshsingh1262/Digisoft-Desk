module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/jest-setup-env.js'],
  testTimeout: 60000,
  forceExit: true,
  globalSetup: '<rootDir>/test/global-setup.ts',
};
