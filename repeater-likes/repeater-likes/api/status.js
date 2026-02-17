// api/status.js
// POST /api/status
//
// Called once when the page loads to get the like status for ALL
// visible widget instances at once — much more efficient than one
// request per widget.
//
// Body: { compIds: string[], visitorId: string }
// Headers: Authorization: Bearer <wix-access-token>
// Returns: { [compId]: { count: number, liked: boolean } }

export default async function handler(req, res) {
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

  const { compIds, visitorId } = req.body ?? {};
  const accessToken = (req.headers['authorization'] ?? '').replace('Bearer ', '').trim();

  if (!Array.isArray(compIds) || !compIds.length || !visitorId || !accessToken) {
    return res.status(400).json({ error: 'compIds, visitorId and Authorization are required' });
  }

  try {
    // Get instanceId and elevated token
    const instanceId = await getInstanceId(accessToken);
    const appToken = await getAppAccessToken(instanceId);

    // Fetch all counts and personal likes in parallel — just 2 API calls
    const [countsData, likesData] = await Promise.all([
      queryAllCounts(appToken, compIds),
      queryPersonalLikes(appToken, compIds, visitorId),
    ]);

    // Build result map
    const result = {};
    compIds.forEach((id) => {
      result[id] = {
        count: countsData[id] ?? 0,
        liked: likesData.has(id),
      };
    });

    return res.status(200).json(result);

  } catch (err) {
    console.error('[status] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getInstanceId(accessToken) {
  const res = await fetch('https://www.wixapis.com/apps/v1/token-info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': accessToken },
  });
  if (!res.ok) throw new Error(`Token info failed: ${res.status}`);
  const data = await res.json();
  return data.instanceId;
}

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

// Get counts for all compIds — returns { [compId]: count }
async function queryAllCounts(appToken, compIds) {
  const res = await fetch('https://www.wixapis.com/wix-data/v2/items/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': appToken },
    body: JSON.stringify({
      dataCollectionId: 'LikeCounts',
      query: {
        filter: { compId: { $in: compIds } },
        paging: { limit: 100 },
      },
    }),
  });

  if (!res.ok) throw new Error(`Query counts failed: ${res.status}`);
  const data = await res.json();

  const map = {};
  (data.dataItems ?? []).forEach((item) => {
    map[item.data.compId] = item.data.count ?? 0;
  });
  return map;
}

// Get which compIds this visitor has liked — returns a Set of compIds
async function queryPersonalLikes(appToken, compIds, visitorId) {
  const res = await fetch('https://www.wixapis.com/wix-data/v2/items/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': appToken },
    body: JSON.stringify({
      dataCollectionId: 'ItemLikes',
      query: {
        filter: {
          $and: [
            { compId: { $in: compIds } },
            { visitorId: { $eq: visitorId } },
          ],
        },
        paging: { limit: 100 },
      },
    }),
  });

  if (!res.ok) throw new Error(`Query personal likes failed: ${res.status}`);
  const data = await res.json();

  return new Set((data.dataItems ?? []).map((item) => item.data.compId));
}
