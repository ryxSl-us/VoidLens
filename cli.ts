/**
 * This part is the CLI interface for the monitoring tool.
 */


import fs from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';
import { log } from './handlers/logger';

async function main() {
  // Parse command line arguments
  const { values } = parseArgs({
    options: {
      type: { type: 'string' },
      help: { type: 'boolean' }
    }
  });

  // Define paths
  const basePath = process.cwd();
  const storagePath = path.join(basePath, 'storage');
  const cachePath = path.join(basePath, 'cache');

  // Show help message if requested or no valid command provided
  if (values.help || !values.type || !['make', 'destroy'].includes(values.type as string)) {
    showHelp();
    return;
  }

  // Process commands
  if (values.type === 'make') {
    await createCacheDirectories(storagePath, cachePath);
  } else if (values.type === 'destroy') {
    await destroyCacheDirectories(storagePath, cachePath);
  }
}

function showHelp() {
  log(`
Void Lens CLI - Cache Management Tool

Usage:
  bun run cli.ts --type=<command>

Commands:
  make      Create cache directories and initialize required files
  destroy   Remove all cache directories and their contents

Options:
  --help    Show this help message
  
Examples:
  bun run cli.ts --type=make
  bun run cli.ts --type=destroy

  or use the compiled version

  lens --type=make 
  lens --type=destroy
`);
}

async function createCacheDirectories(storagePath: string, cachePath: string) {
  try {
    console.log('Creating cache directories...');
    
    // Create directories
    await fs.mkdir(storagePath, { recursive: true });
    await fs.mkdir(cachePath, { recursive: true });
    
    // Create initial ping.json if it doesn't exist
    const pingJsonPath = path.join(storagePath, 'ping.json');
    try {
      await fs.access(pingJsonPath);
      console.log('ping.json already exists, keeping existing file');
    } catch {
      // File doesn't exist, create it
      const defaultPingConfig = {
        interval: 60000,
        targets: [
          {
            id: "google",
            name: "Google",
            url: "https://www.google.com",
            method: "GET",
            timeout: 5000
          }
        ]
      };
      await fs.writeFile(
        pingJsonPath, 
        JSON.stringify(defaultPingConfig, null, 2),
        'utf-8'
      );
      console.log('Created default ping.json configuration');
    }
    
    console.log('Cache directories created successfully!');
    console.log(`Storage path: ${storagePath}`);
    console.log(`Cache path: ${cachePath}`);
  } catch (error) {
    console.error('Error creating cache directories:', error);
    process.exit(1);
  }
}

async function destroyCacheDirectories(storagePath: string, cachePath: string) {
  try {
    console.log('Removing cache directories...');
    
    // Check if directories exist before attempting to remove
    try {
      await fs.access(storagePath);
      await fs.rm(storagePath, { recursive: true, force: true });
      console.log(`Removed storage directory: ${storagePath}`);
    } catch {
      console.log(`Storage directory does not exist: ${storagePath}`);
    }
    
    try {
      await fs.access(cachePath);
      await fs.rm(cachePath, { recursive: true, force: true });
      console.log(`Removed cache directory: ${cachePath}`);
    } catch {
      console.log(`Cache directory does not exist: ${cachePath}`);
    }
    
    console.log('Cache directories removed successfully!');
  } catch (error) {
    console.error('Error removing cache directories:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});