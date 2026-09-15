/*
  serve.ts
  Entry point for the Kilotest service under PM2. index.ts starts the server only when
  it is the program entry point (import.meta.main), which is false inside PM2's process
  container, so PM2 loads this file, which starts the server unconditionally.
*/

// IMPORTS

import {errorMessage} from './util.ts';
import {startServer} from './index.ts';

// EXECUTION

startServer().catch(error => console.log(errorMessage(error)));
