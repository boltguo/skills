#!/usr/bin/env node
import { main } from '../src/cli.js';

main().catch((error) => {
  if (error.name === 'ExitPromptError' || error.name === 'AbortPromptError') {
    console.error('\n已取消。');
    process.exitCode = 130;
  } else {
    console.error(`skilljet: ${error.message}`);
    process.exitCode = 1;
  }
});
