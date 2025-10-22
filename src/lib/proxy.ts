import fs from 'fs';
import path from 'path';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

/**
 * Reads and parses the proxy list from proxies.txt
 * Converts webshare format (host:port:username:password) to URL format
 * @returns Array of proxy strings (format: http://username:password@host:port)
 */
export function getProxyList(): string[] {
  try {
    const proxyFilePath = path.join(process.cwd(), 'src', 'proxies.txt');

    // Check if file exists
    if (!fs.existsSync(proxyFilePath)) {
      console.warn('[Proxy] proxies.txt not found. Proceeding without proxies.');
      return [];
    }

    // Read and parse file
    const fileContent = fs.readFileSync(proxyFilePath, 'utf-8');
    const lines = fileContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#')); // Filter out comments and empty lines

    // Convert webshare format to URL format
    const proxies = lines.map((line) => {
      // If already in URL format, return as is
      if (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('socks')) {
        return line;
      }

      // Parse webshare format: host:port:username:password
      const parts = line.split(':');
      if (parts.length === 4) {
        const [host, port, username, password] = parts;
        return `http://${username}:${password}@${host}:${port}`;
      }

      // If format doesn't match, return as is and let it fail gracefully
      return line;
    });

    if (proxies.length === 0) {
      console.warn('[Proxy] No proxies found in proxies.txt. Proceeding without proxies.');
      return [];
    }

    console.log(`[Proxy] Loaded ${proxies.length} proxy(ies) from proxies.txt`);
    return proxies;
  } catch (error) {
    console.error('[Proxy] Error reading proxies.txt:', error);
    return [];
  }
}

/**
 * Gets a random proxy agent from the proxy list
 * @param route Optional route name for logging purposes
 * @returns Object with proxy agent and proxy URL (masked), or null if no proxies available
 */
export function getRandomProxy(route?: string): { agent: HttpsProxyAgent<string> | HttpProxyAgent<string> | SocksProxyAgent, proxyUrl: string } | null {
  try {
    const proxyList = getProxyList();

    if (proxyList.length === 0) {
      return null;
    }

    // Select random proxy
    const randomProxy = proxyList[Math.floor(Math.random() * proxyList.length)];

    // Extract host:port for logging (mask credentials)
    const maskedProxy = randomProxy.replace(/:[^:@]+@/, ':****@');

    // Extract just host:port for easier identification
    const urlMatch = randomProxy.match(/@([^:]+):(\d+)/);
    const hostPort = urlMatch ? `${urlMatch[1]}:${urlMatch[2]}` : maskedProxy;

    const routePrefix = route ? `[${route}]` : '[Proxy]';
    console.log(`${routePrefix} Selected proxy: ${hostPort}`);
    console.log(`${routePrefix} Proxy URL format: ${maskedProxy}`);

    // Determine proxy type and create appropriate agent
    // For HTTP proxies connecting to HTTPS sites, we need HttpsProxyAgent
    let agent;
    if (randomProxy.startsWith('socks4://') || randomProxy.startsWith('socks5://')) {
      agent = new SocksProxyAgent(randomProxy);
      console.log(`${routePrefix} Using SocksProxyAgent`);
    } else if (randomProxy.startsWith('http://')) {
      // For HTTP proxy to HTTPS target, use HttpsProxyAgent
      agent = new HttpsProxyAgent(randomProxy);
      console.log(`${routePrefix} Using HttpsProxyAgent for HTTP proxy`);
    } else if (randomProxy.startsWith('https://')) {
      agent = new HttpsProxyAgent(randomProxy);
      console.log(`${routePrefix} Using HttpsProxyAgent`);
    } else {
      // Default to HTTPS proxy if no protocol specified
      agent = new HttpsProxyAgent(randomProxy);
      console.log(`${routePrefix} Using HttpsProxyAgent (default)`);
    }

    return { agent, proxyUrl: hostPort };
  } catch (error) {
    console.error('[Proxy] Error creating proxy agent:', error);
    return null;
  }
}