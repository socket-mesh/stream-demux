import type { JestConfigWithTsJest } from 'ts-jest'

const config: JestConfigWithTsJest = {
	verbose: true,
	preset: 'ts-jest/presets/default-esm',
	testEnvironment: 'node',
	transform: {
		'^.+\\.(ts|tsx)?$': ['ts-jest', { useESM: true, tsconfig: { module: 'ES2020', target: 'ES2020' } }]
	},
	moduleNameMapper: {
		"(.+)\\.js": "$1"
	},
	extensionsToTreatAsEsm: ['.ts'],
	testPathIgnorePatterns: ['./dist'],
	modulePathIgnorePatterns: ['<rootDir>/dist']
}

export default config