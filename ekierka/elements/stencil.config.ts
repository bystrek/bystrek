import { angularOutputTarget } from '@stencil/angular-output-target';
import type { Config } from '@stencil/core';

export const config: Config = {
  namespace: 'ekierka',
  outputTargets: [
    {
      type: 'dist-custom-elements',
      customElementsExportBehavior: 'single-export-module',
      externalRuntime: false,
    },
    angularOutputTarget({
      componentCorePackage: '@ekierka/elements',
      outputType: 'standalone',
      directivesProxyFile: '../angular/src/generated/proxies.ts',
      esModules: true,
      inlineProperties: true,
      booleanAttributes: true,
    }),
  ],
};
