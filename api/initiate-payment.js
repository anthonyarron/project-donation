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
    console.error('❌ Missing Pesapal environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // 1️ GET AUTH TOKEN
    const tokenRes = await fetch('https://cybqa.pesapal.com/pesapalv3/api/Auth/RequestToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ consumer_key: PESAPAL_KEY, consumer_secret: PESAPAL_SECRET })
    });
    
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Token fetch failed:', tokenRes.status, errText);
      throw new Error(`Pesapal auth failed: ${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json();
    if (!tokenData.token) throw new Error('No token returned from Pesapal');

    // 2️⃣ CREATE PAYMENT ORDER
    const orderData = {
      id: `CHURCH_${Date.now()}`,
      currency: 'UGX',
      amount: parseFloat(amount),
      description: `Donation - Prestige Worshippers Ministry`,
      callback_url: 'https://project-donation-rho.vercel.app//success', //  Replace with your actual Vercel URL
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

    const orderRes = await fetch('https://cybqa.pesapal.com/pesapalv3/api/Transactions/SubmitOrderRequest', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      console.error('Order submit failed:', orderRes.status, errText);
      throw new Error(`Pesapal order failed: ${orderRes.status}`);
    }

    const orderResult = await orderRes.json();

    if (orderResult.redirect_url) {
      return res.status(200).json({
        success: true,
        redirect_url: orderResult.redirect_url,
        tracking_id: orderResult.order_tracking_id
      });
    } else {
      throw new Error(orderResult.message || 'No redirect URL returned');
    }
  } catch (err) {
    console.error('💥 Function crashed:', err.message);
    return res.status(500).json({ error: 'Payment setup failed', details: err.message });
  }
}
