/*
  requestKit.ts
  Per-request helpers shared by every interface's dispatcher: error serving,
  request attribution, metrics exclusion, and response headers.
*/

// IMPORTS

/* c8 ignore start */
// c8 intermittently reports import lines as uncovered due to a range-merge
// artifact in its remapping of Node's type-stripped source.
import {
  getExclusionCookieValue,
  metricsExclusionCookieName,
  populateFile,
  recordMetric
} from './util.ts';
import type {IncomingMessage, ServerResponse} from 'node:http';
/* c8 ignore stop */

// FUNCTIONS

// Sets response headers.
export const setHeaders = (
  response: ServerResponse, contentType: string, location: string | null, volatility: string = 'high'
) => {
  response.setHeader('content-type', `${contentType}; charset=utf-8`);
  if (location) {
    response.setHeader('content-location', location);
  }
  response.setHeader('Access-Control-Allow-Origin', '*');
  const lives: Record<string, number[]> = {
    ultra: [3, 30],
    high: [300, 3000],
    medium: [1000, 10000],
    low: [5000, 50000]
  };
  response.setHeader(
    'Cache-Control',
    `public, max-age=${lives[volatility]![0]}, stale-while-revalidate=${lives[volatility]![1]}`
  );
};
// Serves or sends an error message.
export const serveError = async (error: Record<string, unknown>, response: ServerResponse, isHumanUser = true, statusCode = 400): Promise<void> => {
  const errorLines = Object.entries(error).map(pair => `${pair[0]}: ${pair[1]}`);
  const errorSummary = errorLines.join('\n') || 'ERROR';
  console.log(errorSummary);
  if (!response.writableEnded) {
    response.statusCode = statusCode;
    // If the request is from a human user:
    if (isHumanUser) {
      // Serve an HTML page containing the message property of the error.
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.setHeader('content-location', '/error.html');
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3000');
      const errorMessage = typeof error.message === 'string' ? error.message : 'ERROR';
      const errorPage = await populateFile('error.html', {error: errorMessage});
      response.end(errorPage);
    }
    // Otherwise, i.e. if it is from an agent:
    else {
      // Send a JSON response containing the entire error.
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({error}));
    }
  }
  else {
    console.log('Cannot send error response because the response has ended.');
  }
};
// Returns the IP address a request should be attributed to: the value of its
// x-forwarded-for header (Caddy runs in front of Kilotest, so a real client's address
// arrives this way, not as the socket's own remote address), else the socket's remote
// address, else 'unknown' if neither is available.
export const getRequestIP = (request: IncomingMessage): string | string[] => {
  const forwardedFor = request.headers['x-forwarded-for'];
  const remoteAddress = request.socket.remoteAddress;
  return forwardedFor || remoteAddress || 'unknown';
};
// Creates an error object about a suspicious request.
export const getAbuseError = (request: IncomingMessage, reason: string | undefined) => {
  const {method, url, headers} = request;
  return {
    message: 'Invalid request',
    reason,
    'IP address': getRequestIP(request),
    method,
    URL: url,
    'user agent': headers['user-agent'] || 'none',
    referer: headers.referer || 'none',
    time: new Date().toISOString()
  };
};
// Returns whether a request carries the metrics-exclusion cookie with the value that
// proves it. A request without a valid AUTH_CODE configured can never match, since
// getExclusionCookieValue then hashes an empty string, which no cookie should equal.
export const isMetricsExcluded = (request: IncomingMessage): boolean => {
  const header = request.headers.cookie;
  if (!header || !process.env.AUTH_CODE) {
    return false;
  }
  const cookies = header.split(';').map(pair => pair.trim().split('='));
  const cookieValue = cookies.find(([name]) => name === metricsExclusionCookieName)?.[1];
  return cookieValue === getExclusionCookieValue();
};
// Records a pageViews or apiOperations metric, unless this request's browser has proven,
// via a valid authCode submitted earlier on metrics.html, that it belongs to the
// maintainer testing Kilotest manually rather than to real usage.
export const recordPageMetric = (
  request: IncomingMessage, category: 'pageViews' | 'apiOperations', name: string
): Promise<void> =>
  isMetricsExcluded(request) ? Promise.resolve() : recordMetric(category, name);
