/* oxlint-disable no-default-export */
import { microservice } from '@govirtuo/oxc-config/oxlint';
import { defineConfig } from 'oxlint';

export default defineConfig({
  ...microservice,
  ignorePatterns: microservice.ignorePatterns.concat('dist/**', 'test/**'),
});
