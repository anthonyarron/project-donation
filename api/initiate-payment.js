// api/initiate-payment.js
export default async function handler(req, res) {
  // 🔒 Allow your frontend to talk to this function
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, phone, amount } = req.body;
  if (!name || !phone || !amount) {
    return res.status(400).json({ error: 'Missing name, phone, or amount' });
  }

  // 🤫 These will come from Vercel's secure environment (we set them in Step 4)
  const PESAPAL_KEY = process.env.PESAPAL_CONSUMER_KEY;
  const PESAPAL_SECRET = process.env.PESAPAL_CONSUMER_SECRET;

  try {
    // 1️⃣ GET AUTH TOKEN
    const tokenRes = await fetch('https://cybqa.pesapal.com/pesapalv3/api/Auth/RequestToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ consumer_key: PESAPAL_KEY, consumer_secret: PESAPAL_SECRET })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.token) throw new Error('Failed to authenticate with Pesapal');

    // 2️⃣ CREATE PAYMENT ORDER
    const orderData = {
      id: `CHURCH_${Date.now()}`,
      currency: 'UGX',
      amount: parseFloat(amount),
      description: `Donation - Prestige Worshippers Ministry`,
      callback_url: 'https://your-site.vercel.app/success', // We'll update this after deployment
      notification_url: 'https://your-site.vercel.app/api/notify',
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
    const orderResult = await orderRes.json();

    if (orderResult.redirect_url) {
      return res.status(200).json({
        success: true,
        redirect_url: orderResult.redirect_url,
        tracking_id: orderResult.order_tracking_id
      });
    } else {
      throw new Error(orderResult.message || 'Payment failed to initialize');
    }
  } catch (err) {
    console.error('Pesapal Error:', err);
    return res.status(500).json({ error: 'Payment setup failed', details: err.message });
  }
}