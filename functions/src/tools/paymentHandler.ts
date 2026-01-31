export async function generatePaymentLink(phone: string, planName: string) {
    const https = require('https');
    // Access env inside function to be safe
    const CULQI_PRIVATE_KEY = process.env.CULQI_PRIVATE_KEY;

    if (!CULQI_PRIVATE_KEY) throw new Error("CULQI_PRIVATE_KEY is not configured.");

    const createCulqiOrder = (amount: number, description: string, client: any, metadata: any) => {
        return new Promise((resolve, reject) => {
            const expiration_date = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
            const order_number = `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

            const payload = JSON.stringify({
                amount,
                currency_code: 'PEN',
                description,
                order_number,
                client_details: {
                    first_name: client.first_name,
                    last_name: client.last_name,
                    email: client.email,
                    phone_number: client.phone
                },
                expiration_date,
                metadata
            });

            const options = {
                hostname: 'api.culqi.com',
                path: '/v2/orders',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CULQI_PRIVATE_KEY}`,
                    'Content-Type': 'application/json',
                    'Content-Length': payload.length
                }
            };

            const req = https.request(options, (res: any) => {
                let data = '';
                res.on('data', (chunk: any) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    } else {
                        reject(new Error(`Culqi API Error: ${res.statusCode} - ${data}`));
                    }
                });
            });

            req.on('error', (e: any) => {
                reject(e);
            });

            req.write(payload);
            req.end();
        });
    };

    let amount = 8000;
    const normalizedPlan = planName?.toLowerCase() || '';

    if (normalizedPlan.includes('2') || normalizedPlan.includes('dos')) amount = 12000;
    else if (normalizedPlan.includes('3') || normalizedPlan.includes('tres')) amount = 15000;
    else if (normalizedPlan.includes('clase')) amount = 2000;

    const client = {
        first_name: 'Usuario',
        last_name: 'WhatsApp',
        email: 'cliente@whatsapp.com',
        phone: phone
    };

    // Note: We don't have access to 'db' here unless passed. For simplicity, we skip DB lookup for name.
    // Or we can modify function signature to accept client details.
    // For now, let's keep it simple to verify deployment.

    const order: any = await createCulqiOrder(
        amount,
        `Plan ${planName || 'Mensual'} - Fit IA`,
        client,
        { phone: phone, planName: planName, source: 'whatsapp_ai' }
    );

    const orderId = order.id;
    if (!orderId) {
        throw new Error("Culqi did not return an order ID");
    }

    return `https://fit-ia-megagym.web.app/pagar?orderId=${orderId}`;
}
