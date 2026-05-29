// 🔧 CONFIGURATION: Change this to 'LIVE' when you are ready to accept real money
const ENVIRONMENT = 'LIVE'; // Options: 'SANDBOX' or 'LIVE'

const API_BASE = ENVIRONMENT === 'LIVE' 
  ? 'https://pay.pesapal.com/pesapalv3' 
  : 'https://cybqa.pesapal.com/pesapalv3';

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
    console.error('❌ Missing keys in Vercel');
    return res.status(500).json({ error: 'Server config error' });
  }

  try {
    // 1️⃣ GET TOKEN
    const tokenRes = await fetch(`${API_BASE}/api/Auth/RequestToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ consumer_key: PESAPAL_KEY, consumer_secret: PESAPAL_SECRET })
    });

    // 🔍 DEBUG: See exactly what Pesapal replied
    const tokenData = await tokenRes.json();
    console.log('👉 Pesapal Auth Response:', JSON.stringify(tokenData));

    if (!tokenRes.ok) {
       throw new Error(`Auth Failed (${tokenRes.status}): ${JSON.stringify(tokenData)}`);
    }
    if (!tokenData.token) {
      // This is where you were stuck. Now we'll see the actual message.
      throw new Error(`No token received. Pesapal said: ${JSON.stringify(tokenData)}`);
    }

    // 2️⃣ SUBMIT ORDER
    const orderData = {
      id: `CHURCH_${Date.now()}`,
      currency: 'UGX',
      amount: parseFloat(amount),
      description: `Donation - Prestige Worshippers Ministry`,
      callback_url: 'https://project-donation-rho.vercel.app//success', // Update this
      notification_url: 'https://project-donation-rho.vercel.app//api/notify',
      billing_address: {
        email_address: 'donor@pesapal.com',
        phone_number: phone,
        country_code: 'UG',
        first_name: name.split(' ')[0],
        last_name: name.split(' ').slice(1).join(' ') || 'Member',
        line_1: 'Prestige Worshippers Ministry'
      }
    };

    const orderRes = await fetch(`${API_BASE}/api/Transactions/SubmitOrderRequest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    const orderResult = await orderRes.json();
    console.log(' Pesapal Order Response:', JSON.stringify(orderResult));

    if (!orderRes.ok) throw new Error(`Order Failed: ${JSON.stringify(orderResult)}`);
    if (!orderResult.redirect_url) throw new Error(`No URL: ${JSON.stringify(orderResult)}`);

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
