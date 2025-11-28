import * as couchbase from 'couchbase';

const CB_USERNAME = process.env.CB_USERNAME;
const CB_PASSWORD = process.env.CB_PASSWORD;
const CB_CONNECT_STRING = process.env.CB_CONNECT_STRING;
const CB_BUCKET = process.env.CB_BUCKET;

if (!CB_USERNAME) {
  throw new Error(
    'Please define the CB_USERNAME environment variable. \nIf you are seeing this error after creating a new trial database, please see the instructions in the README for re-deploying your application.'
  );
}

if (!CB_PASSWORD) {
  throw new Error('Please define the CB_PASSWORD environment variable');
}

if (!CB_CONNECT_STRING) {
  throw new Error('Please define the CB_CONNECT_STRING environment variable');
}

if (!CB_BUCKET) {
  throw new Error('Please define the CB_BUCKET environment variable inside');
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
interface CachedConnection {
  conn: couchbase.Cluster | null;
  promise: Promise<couchbase.Cluster> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var couchbase: CachedConnection | undefined;
}

let cached: CachedConnection = global.couchbase || { conn: null, promise: null };

if (!global.couchbase) {
  global.couchbase = cached;
}

async function createCouchbaseCluster() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    try {
      let connectionString = CB_CONNECT_STRING!;

      // temporary fix to ensure testability across all environments
      if (CB_CONNECT_STRING!.startsWith('couchbases')) {
        connectionString = connectionString + '?tls_verify=none';
      }

      cached.promise = couchbase.connect(connectionString, {
        username: CB_USERNAME,
        password: CB_PASSWORD,
        timeouts: {
          kvTimeout: 10000,
          queryTimeout: 75000,
        },
      });
    } catch (e) {
      cached.promise = null;
      throw new Error(
        'Error Connecting to Couchbase Database. Ensure the correct IPs are allowed and double check your database user credentials.'
      );
    }
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export async function connectToDatabase() {
  const cluster = await createCouchbaseCluster();
  const bucket = cluster.bucket(CB_BUCKET!);
  const collection = bucket.defaultCollection();
  const profileCollection = bucket.collection('profile');

  let dbConnection = {
    cluster,
    bucket,
    collection,
    profileCollection,
  };

  return dbConnection;
}