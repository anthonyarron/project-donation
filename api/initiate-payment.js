const ENVIRONMENT = 'SANDBOX'; // SANDBOX or LIVE

const API_BASE = ENVIRONMENT === 'LIVE' 
  ? 'https://pay.pesapal.com/pesapalv3' 
  : 'https://cybqa.pesapal.com/pesapalv3';

console.log('🔧 Using environment:', ENVIRONMENT);
console.log('🔧 API Base URL:', API_BASE);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, phone, amount } = req.body || {};
  if (!name || !phone || !amount) {
    return res.status(400).json({ error: 'Missing name, phone, or amount' });
  }

  const PESAPAL_KEY = process.env.PESAPAL_CONSUMER_KEY;
  const PESAPAL_SECRET = process.env.PESAPAL_CONSUMER_SECRET;

  if (!PESAPAL_KEY || !PESAPAL_SECRET) {
    console.error('❌ Missing Pesapal keys');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // 1️⃣ GET TOKEN
    console.log('📡 Requesting token from Pesapal...');
    const tokenRes = await fetch(`${API_BASE}/api/Auth/RequestToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ consumer_key: PESAPAL_KEY, consumer_secret: PESAPAL_SECRET })
    });

    const tokenText = await tokenRes.text();
    console.log('📥 Token response status:', tokenRes.status);
    console.log('📥 Token response text:', tokenText.substring(0, 200));

    // Check if we got HTML instead of JSON
    if (tokenText.trim().startsWith('<')) {
      console.error('❌ Received HTML instead of JSON. Pesapal may be down or URL is wrong.');
      return res.status(500).json({ 
        error: 'Pesapal service unavailable', 
        details: 'Received HTML error page instead of JSON' 
      });
    }

    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch (e) {
      console.error('❌ Failed to parse JSON:', e);
      return res.status(500).json({ error: 'Invalid response from Pesapal' });
    }

    if (!tokenRes.ok) {
      throw new Error(`Auth Failed (${tokenRes.status}): ${JSON.stringify(tokenData)}`);
    }

    if (!tokenData.token) {
      throw new Error(`No token received: ${JSON.stringify(tokenData)}`);
    }

    console.log('✅ Token received successfully');

    // 2️⃣ SUBMIT ORDER
    const orderData = {
      id: `CHURCH_${Date.now()}`,
      currency: 'UGX',
      amount: parseFloat(amount),
      description: `Donation - Prestige Worshippers Ministry`,
      callback_url: 'https://project-donation-qk5ovxua9-anthony-s-projects506.vercel.app//success', // UPDATE THIS
      notification_url: 'https://project-donation-qk5ovxua9-anthony-s-projects506.vercel.app//api/notify',
      billing_address: {
        email_address: 'donor@pesapal.com',
        phone_number: phone,
        country_code: 'UG',
        first_name: name.split(' ')[0],
        last_name: name.split(' ').slice(1).join(' ') || 'Member',
        line_1: 'Prestige Worshippers Ministry'
      }
    };

    console.log('📡 Submitting order to Pesapal...');
    const orderRes = await fetch(`${API_BASE}/api/Transactions/SubmitOrderRequest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    const orderText = await orderRes.text();
    console.log('📥 Order response status:', orderRes.status);
    console.log('📥 Order response:', orderText.substring(0, 300));

    if (orderText.trim().startsWith('<')) {
      console.error('❌ Order endpoint returned HTML');
      return res.status(500).json({ error: 'Pesapal order service unavailable' });
    }

    let orderResult;
    try {
      orderResult = JSON.parse(orderText);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid order response from Pesapal' });
    }

    if (!orderRes.ok) {
      throw new Error(`Order Failed (${orderRes.status}): ${JSON.stringify(orderResult)}`);
    }

    if (!orderResult.redirect_url) {
      throw new Error(`No redirect URL: ${JSON.stringify(orderResult)}`);
    }

    console.log('✅ Order created successfully');
    return res.status(200).json({
      success: true,
      redirect_url: orderResult.redirect_url,
      tracking_id: orderResult.order_tracking_id
    });

  } catch (err) {
    console.error('💥 Crash:', err.message);
    return res.status(500).json({ error: 'Payment failed', details: err.message });
  }
}
