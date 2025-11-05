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
      return [];
    }

    return proxies;
  } catch {
    return [];
  }
}

/**
 * Gets a random proxy agent from the proxy list
 * @param route Optional route name for logging purposes
 * @returns Object with proxy agent and proxy URL (masked), or null if no proxies available
 */
export function getRandomProxy(_route?: string): { agent: HttpsProxyAgent<string> | HttpProxyAgent<string> | SocksProxyAgent, proxyUrl: string } | null {
  try {
    const proxyList = getProxyList();

    if (proxyList.length === 0) {
      return null;
    }

    // Select random proxy
    const randomProxy = proxyList[Math.floor(Math.random() * proxyList.length)];

    // Extract just host:port for easier identification
    const urlMatch = randomProxy.match(/@([^:]+):(\d+)/);
    const maskedProxy = randomProxy.replace(/:[^:@]+@/, ':****@');
    const hostPort = urlMatch ? `${urlMatch[1]}:${urlMatch[2]}` : maskedProxy;

    // Determine proxy type and create appropriate agent
    // For HTTP proxies connecting to HTTPS sites, we need HttpsProxyAgent
    let agent;
    if (randomProxy.startsWith('socks4://') || randomProxy.startsWith('socks5://')) {
      agent = new SocksProxyAgent(randomProxy);
    } else if (randomProxy.startsWith('http://')) {
      // For HTTP proxy to HTTPS target, use HttpsProxyAgent
      agent = new HttpsProxyAgent(randomProxy);
    } else if (randomProxy.startsWith('https://')) {
      agent = new HttpsProxyAgent(randomProxy);
    } else {
      // Default to HTTPS proxy if no protocol specified
      agent = new HttpsProxyAgent(randomProxy);
    }

    return { agent, proxyUrl: hostPort };
  } catch {
    return null;
  }
}