<p align="center">
  <a href="https://ryx.us">
    <img src="https://raw.githubusercontent.com/Ryx-us/VoidLens/refs/heads/main/logo.svg" alt="Voidlens Banner">
  </a>

</p>

> [!WARNING]
> VoidLens was developed with BUN, we recommend you use bun to compile the project to Node before using with node. (A pre-compiled JS file is found at /build)

## How to configure?
- Using our CLI you can configure the cache paths.
- ```node cli.ts --type=make``` to create the cache paths
- ```node cli.ts --type=destory``` to destroy/clear cache
- Afterwards in the storage path a ping.json file can be found, there you can add more targets or remove targets to your liking.
- Now create a .env file and Add DISCORD_WEBHOOK_URL & PORT
-Example
  DISCORD_WEBHOOK_URL=https://myepicdiscordhook.com/applocations
  PORT=8054

## How to start. 

### Using PM2
- Install pm2
- ```bun build ./main.ts  --outfile build/voidlens.js --target=node``` to build the project
- ```pm2 start voidlens.js```
- Your Uptime Monitor API is running at localhost.
  
