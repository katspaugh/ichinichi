module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.module\\.css$": "identity-obj-proxy",
    "\\.css$": "<rootDir>/src/__tests__/__mocks__/styleMock.js",
  },
  setupFiles: ["<rootDir>/jest.setup.cjs"],
};
