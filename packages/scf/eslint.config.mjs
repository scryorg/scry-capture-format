import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts'] },
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  { files: ['**/*.ts'], rules: {} },
);
