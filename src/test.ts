// This file is required by karma.conf.js and loads recursively all the .spec
// and framework files.
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

// The karma builder (@angular-devkit/build-angular) discovers and bundles
// every src/**/*.spec.ts file itself via its find-tests plugin, so no
// require.context is needed here.
getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting()
);
