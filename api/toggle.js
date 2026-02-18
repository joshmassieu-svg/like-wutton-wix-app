// api/toggle.js
// POST /api/toggle
//
// Called by the custom element widget when a visitor clicks the like button.
//
// How auth works (per Wix docs):
//   1. The custom element sends its Wix access token in the Authorization header
//   2. We call Wix Token Info to extract the instanceId (which site this is)
//   3. We elevate to an app identity to get write access to the site's CMS
//   4. We read/write to the site's own ItemLikes + LikeCounts collections
//
// Body: { compId: string, visitorId: string }
// Returns: { liked: boolean, count: number }

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { compId, visitorId } = req.body ?? {};
  const authHeader = req.headers['authorization'] ?? '';
  const accessToken = authHeader.replace('Bearer ', '').trim();

  if (!compId || !visitorId || !accessToken) {
    return res.status(400).json({ error: 'compId, visitorId and Authorization header are required' });
  }

  try {
    // ── Step 1: Get instanceId from the visitor's Wix access token ──────────
    const instanceId = await getInstanceId(accessToken);

    // ── Step 2: Get an elevated app-level access token to write to Wix CMS ─
    const appToken = await getAppAccessToken(instanceId);

    // ── Step 3: Check if this visitor already liked this compId ─────────────
    const existingLike = await queryLike(appToken, instanceId, compId, visitorId);

    let liked;
    let newCount;

    if (existingLike) {
      // Unlike — remove the like record
      await deleteLike(appToken, instanceId, existingLike._id);
      liked = false;
      newCount = await decrementCount(appToken, instanceId, compId);
    } else {
      // Like — insert a new record
      await insertLike(appToken, instanceId, compId, visitorId);
      liked = true;
      newCount = await incrementCount(appToken, instanceId, compId);
    }

    return res.status(200).json({ liked, count: newCount });

  } catch (err) {
    console.error('[toggle] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ─── Wix Token Info — extracts instanceId from visitor access token ──────────
// Docs: https://dev.wix.com/docs/build-apps/develop-your-app/frameworks/self-hosting/supported-extensions/site-extensions/site-widgets-and-plugins/identify-the-app-instance-in-a-self-hosted-site-widget
async function getInstanceId(accessToken) {
  const res = await fetch('https://www.wixapis.com/apps/v1/token-info', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': accessToken,
    },
  });

  if (!res.ok) throw new Error(`Token info failed: ${res.status}`);
  const data = await res.json();
  return data.instanceId;
}

// ─── Get elevated app-level access token ─────────────────────────────────────
// Docs: https://dev.wix.com/docs/api-reference/app-management/oauth-2/create-access-token
async function getAppAccessToken(instanceId) {
  const res = await fetch('https://www.wixapis.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: process.env.WIX_APP_ID,
      client_secret: process.env.WIX_APP_SECRET,
      instance_id: instanceId,
    }),
  });

  if (!res.ok) throw new Error(`App token failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

// ─── Wix Data helpers — read/write to the site's own CMS collections ─────────
// Collection IDs use the format: @appId/collection-name
// Per docs, the full ID becomes: @{appId}/{collectionSuffix}
const LIKES_COL = `ItemLikes`;
const COUNTS_COL = `LikeCounts`;

function wixDataHeaders(appToken) {
  return {
    'Content-Type': 'application/json',
    'Authorization': appToken,
    'wix-site-id': '', // not needed when using app token — instanceId is embedded
  };
}

// Query for an existing like
async function queryLike(appToken, instanceId, compId, visitorId) {
  const res = await fetch(`https://www.wixapis.com/wix-data/v2/items/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': appToken,
    },
    body: JSON.stringify({
      dataCollectionId: LIKES_COL,
      query: {
        filter: {
          $and: [
            { compId: { $eq: compId } },
            { visitorId: { $eq: visitorId } },
          ],
        },
        paging: { limit: 1 },
      },
    }),
  });

  if (!res.ok) throw new Error(`Query like failed: ${res.status}`);
  const data = await res.json();
  return data.dataItems?.[0]?.data ?? null;
}

// Insert a new like
async function insertLike(appToken, instanceId, compId, visitorId) {
  const res = await fetch(`https://www.wixapis.com/wix-data/v2/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': appToken,
    },
    body: JSON.stringify({
      dataCollectionId: LIKES_COL,
      dataItem: {
        data: { compId, visitorId, likedAt: new Date().toISOString() },
      },
    }),
  });

  if (!res.ok) throw new Error(`Insert like failed: ${res.status}`);
}

// Delete a like by its _id
async function deleteLike(appToken, instanceId, itemId) {
  const res = await fetch(
    `https://www.wixapis.com/wix-data/v2/items/${itemId}?dataCollectionId=${LIKES_COL}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': appToken },
    }
  );

  if (!res.ok) throw new Error(`Delete like failed: ${res.status}`);
}

// Get or create the count record, then increment
async function incrementCount(appToken, instanceId, compId) {
  return updateCount(appToken, instanceId, compId, 1);
}

async function decrementCount(appToken, instanceId, compId) {
  return updateCount(appToken, instanceId, compId, -1);
}

async function updateCount(appToken, instanceId, compId, delta) {
  // Find existing count record
  const queryRes = await fetch(`https://www.wixapis.com/wix-data/v2/items/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': appToken,
    },
    body: JSON.stringify({
      dataCollectionId: COUNTS_COL,
      query: {
        filter: { compId: { $eq: compId } },
        paging: { limit: 1 },
      },
    }),
  });

  if (!queryRes.ok) throw new Error(`Query count failed: ${queryRes.status}`);
  const queryData = await queryRes.json();
  const existing = queryData.dataItems?.[0];

  if (existing) {
    // Update existing count
    const newCount = Math.max(0, (existing.data.count ?? 0) + delta);
    const updateRes = await fetch(
      `https://www.wixapis.com/wix-data/v2/items/${existing.data._id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': appToken,
        },
        body: JSON.stringify({
          dataCollectionId: COUNTS_COL,
          dataItem: {
            data: { ...existing.data, count: newCount },
          },
        }),
      }
    );
    if (!updateRes.ok) throw new Error(`Update count failed: ${updateRes.status}`);
    return newCount;
  } else {
    // Insert new count record
    const newCount = delta > 0 ? 1 : 0;
    const insertRes = await fetch(`https://www.wixapis.com/wix-data/v2/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': appToken,
      },
      body: JSON.stringify({
        dataCollectionId: COUNTS_COL,
        dataItem: {
          data: { compId, count: newCount },
        },
      }),
    });
    if (!insertRes.ok) throw new Error(`Insert count failed: ${insertRes.status}`);
    return newCount;
  }
}
