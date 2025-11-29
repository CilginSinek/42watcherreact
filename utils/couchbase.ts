// Serverless-compatible Couchbase REST API Client
// No native binaries required - works on Vercel, Netlify, etc.

const CB_USERNAME = process.env.CB_USERNAME;
const CB_PASSWORD = process.env.CB_PASSWORD;
const CB_CONNECT_STRING = process.env.CB_CONNECT_STRING;
const CB_BUCKET = process.env.CB_BUCKET;
const CB_SCOPE = process.env.CB_SCOPE || '_default';

if (!CB_USERNAME || !CB_PASSWORD || !CB_CONNECT_STRING || !CB_BUCKET) {
  throw new Error('Missing Couchbase environment variables');
}

// Extract hostname from connection string
const getHostname = () => {
  let connectionString = CB_CONNECT_STRING!;
  // Remove protocol
  connectionString = connectionString.replace(/^couchbases?:\/\//, '');
  // Remove port and parameters
  connectionString = connectionString.split(':')[0].split('?')[0];
  return connectionString;
};

const COUCHBASE_HOST = getHostname();
const COUCHBASE_PROTOCOL = CB_CONNECT_STRING!.startsWith('couchbases') ? 'https' : 'http';
const COUCHBASE_PORT = CB_CONNECT_STRING!.startsWith('couchbases') ? '18093' : '8093';
const QUERY_ENDPOINT = `${COUCHBASE_PROTOCOL}://${COUCHBASE_HOST}:${COUCHBASE_PORT}/query/service`;

// Basic auth header
const authHeader = 'Basic ' + Buffer.from(`${CB_USERNAME}:${CB_PASSWORD}`).toString('base64');

interface QueryOptions {
  parameters?: Record<string, unknown>;
}

interface QueryResult {
  rows: unknown[];
  metrics?: unknown;
}

interface QueryRequestBody {
  statement: string;
  timeout: string;
  [key: string]: unknown;
}

/**
 * Execute N1QL query using Couchbase REST API
 * This works in serverless environments (Vercel, Netlify, etc.)
 */
export async function executeQuery(
  statement: string,
  options: QueryOptions = {}
): Promise<QueryResult> {
  try {
    const body: QueryRequestBody = {
      statement,
      timeout: '75s',
    };

    // Add named parameters if provided
    if (options.parameters) {
      Object.keys(options.parameters).forEach((key) => {
        body[`$${key}`] = options.parameters![key];
      });
    }

    // Use undici for better control over TLS (Node.js 18+)
    const fetchFn = fetch;
    
    // For HTTPS with self-signed certs, disable verification
    if (COUCHBASE_PROTOCOL === 'https') {
      // Node.js environment variable to disable certificate validation
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const response = await fetchFn(QUERY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(body),
    });

    // Re-enable certificate validation after request
    if (COUCHBASE_PROTOCOL === 'https') {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Couchbase query failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    // Handle query errors
    if (data.errors && data.errors.length > 0) {
      throw new Error(`Query error: ${JSON.stringify(data.errors)}`);
    }

    return {
      rows: data.results || [],
      metrics: data.metrics,
    };
  } catch (error) {
    // Re-enable certificate validation in case of error
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    console.error('Couchbase query error:', error);
    throw error;
  }
}

/**
 * Legacy compatibility wrapper
 * Mimics the old SDK's cluster.query() interface
 */
export async function connectToDatabase() {
  return {
    cluster: {
      query: async (statement: string, options?: QueryOptions) => {
        return executeQuery(statement, options);
      },
    },
    bucket: CB_BUCKET,
  };
}

/**
 * Direct query function for convenience
 */
export async function query(statement: string, options?: QueryOptions) {
  return executeQuery(statement, options);
}

/**
 * Get full keyspace name for a collection
 * @param collection - Collection name (e.g., 'students', 'projects')
 * @returns Full keyspace path (e.g., 'product._default.students')
 */
export function getKeyspace(collection: string): string {
  return `${CB_BUCKET}.${CB_SCOPE}.${collection}`;
}