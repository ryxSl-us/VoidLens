import { Hono } from 'hono';
import { UptimeMonitor } from './monitor';

export function createRouter(monitor: UptimeMonitor): Hono {
  const app = new Hono();

  // System monitoring endpoints
  app.get('/status', async (c) => {
    const status = monitor.getCurrentStatus();
    return c.json(status);
  });

  app.get('/history', async (c) => {
    const { days, i, args } = c.req.query();
    const daysNum = days ? parseInt(days) : 7;
    const count = i ? parseInt(i) : 50; // Default to 50 results
    const includePing = args === 'ping'; // ping data is passed if args is 'ping'
    
    const history = await monitor.getHistory(daysNum, count, includePing);
    return c.json(history);


  });



  app.get('/stats', async (c) => {
    const { days } = c.req.query();
    const daysNum = days ? parseInt(days) : 30;
    
    const stats = await monitor.getUptimeStats(daysNum);
    return c.json(stats);
  });

  // Ping monitoring endpoints
  app.get('/ping/targets', async (c) => {
    const targets = monitor.getPingTargets();
    return c.json(targets);
  });

  app.get('/ping/target/:id', async (c) => {
    const targetId = c.req.param('id');
    const result = monitor.getLatestPingResult(targetId);
    
    if (!result) {
      return c.json({ error: 'Target not found' }, 404);
    }
    
    return c.json(result);
  });

  app.get('/ping/history/:id', async (c) => {
    const targetId = c.req.param('id');
    const { days, i } = c.req.query();
    const daysNum = days ? parseInt(days) : 1;
    const count = i ? parseInt(i) : 50;
    
    const results = monitor.getPingResults(targetId);
    const cutoffTime = Date.now() - (daysNum * 24 * 60 * 60 * 1000);
    const filteredResults = results
      .filter(result => result.timestamp >= cutoffTime)
      .slice(-count);
    
    return c.json(filteredResults);
  });

  app.get('/ping/stats/:id', async (c) => {
    const targetId = c.req.param('id');
    const { days } = c.req.query();
    const daysNum = days ? parseInt(days) : 1;
    
    const uptimePercentage = monitor.getPingUptimePercentage(targetId, daysNum);
    const averageResponseTime = monitor.getPingAverageResponseTime(targetId, daysNum);
    
    return c.json({
      uptimePercentage,
      averageResponseTime,
      timeframe: `${daysNum} days`
    });
  });

  return app;
}