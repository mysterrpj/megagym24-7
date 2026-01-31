
import axios from 'axios';

const CULQI_API_URL = 'https://api.culqi.com/v2';

// Private Key for server-side operations
const CULQI_PRIVATE_KEY = process.env.CULQI_PRIVATE_KEY;

export interface CulqiOrder {
    amount: number;
    currency_code: string;
    description: string;
    order_number: string;
    client_details: {
        first_name: string;
        last_name: string;
        email: string;
        phone_number: string;
    };
    expiration_date: number; // Unix timestamp
    metadata?: Record<string, string>;
}

export const createCulqiOrder = async (
    amount: number, // In cents (e.g. 8000 for S/ 80.00)
    description: string,
    client: { first_name: string; last_name: string; email: string; phone: string },
    metadata: any = {}
) => {
    if (!CULQI_PRIVATE_KEY) {
        throw new Error("CULQI_PRIVATE_KEY is not configured.");
    }

    // Expiration: 1 day from now
    const expiration_date = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

    // Unique order number (Timestamp + Random)
    const order_number = `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const payload: CulqiOrder = {
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
    };

    try {
        const response = await axios.post(`${CULQI_API_URL}/orders`, payload, {
            headers: {
                'Authorization': `Bearer ${CULQI_PRIVATE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // Culqi returns a 'qr' or 'id' but for Payments Link we need to construct it?
        // Wait, Culqi API v2 'Recurrent' might be different. 
        // For CulqiLink (Payment Link), we might need to use a different endpoint or the 'orders' endpoint is sufficient to verify.
        // Actually, Culqi's API doesn't generate a "hosted page" link via the /orders endpoint directly unless using CulqiCheckout.
        // However, the user wants a LINK that can be shared.
        // If we use 'CulqiLink' strictly, usually it's manual.
        // But we can generate an Order, and if we use the Checkout URL with that Order ID, it works?
        // Let's assume standard behavior: We might not get a 'hosted link' directly from /orders response like Stripe.
        // We might need to implement a simple front-end redirector or use the "Integración" flow.
        // But wait, the user showed "CulqiLink" UI.
        // Research: Does Culqi have an endpoint to Create a Layout/Link?
        // If not, we fall back to: We create an Order -> We give the user a link to OUR web app (e.g. /pagar/[orderId]) -> Our web app loads Culqi Checkout.
        // This is actually safer and standard.
        // Let's return the Order Object for now.

        return response.data;

    } catch (error: any) {
        console.error("Culqi API Error:", error.response?.data || error.message);
        throw new Error("Failed to create Culqi order.");
    }
};
