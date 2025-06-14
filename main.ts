import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { createRouter } from './router';
import { UptimeMonitor } from './monitor';
import path from 'node:path';
import { log } from './handlers/logger';
import { dir } from 'node:console';
const fs = require('fs/promises');

const welcome = {
    title: 'Welcome to VoidLens Uptime Monitor API',
    endpoints: [
        {
            path: '/api/status',
            description: 'Get current status'
        },
        {
            path: '/api/history',
            description: 'Retrieve historical data'
        },
        {
            path: '/api/stats',
            description: 'Get uptime statistics'
        },
        {
            path: '/api/stream',
            description: 'Http stream for real-time updates'
        },
        {
            path: '/api/health',
            description: 'Health check endpoint'
        },
        {
            path: '/api/ping',
            description: 'Ping endpoints',
            subRoutes: [
                {
                    path: '/api/ping/targets',
                    description: 'List all ping targets'
                },
                {
                    path: '/api/ping/target/:id',
                    description: 'Get latest ping result for a target'
                },
                {
                    path: '/api/ping/history/:id',
                    description: 'Get ping history for a target'
                },
                {
                    path: '/api/ping/stats/:id',
                    description: 'Get ping statistics for a target'
                }
            ]
        },


    ]

};



async function main() {
  try {
    log('Voidlens Starting...', 'info')
    const app = new Hono();
    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

    
    const monitor = new UptimeMonitor();
    await monitor.initialize();
    log('Uptime Monitor initialized successfully', 'info');

   
    app.use('*', logger());

    
    app.route('/api', createRouter(monitor));

   
    app.get('/', (c) => c.json(welcome));

    app.get('/health', (c) => c.json({ status: 'ok' }));

    

    log('Router and Routes created successfully', 'info');



    
    console.log(`Server is starting on port http://localhost:${PORT}`);
    serve({
      fetch: app.fetch,
      port: PORT
    });

    
   
  } catch (error) {
    console.error('Error initializing uptime monitor:', error);
  }
}

main();

