export async function processMessage(phone: string, messageText: string) {
    // Lazy imports (CommonJS style)
    const OpenAI = require('openai');
    const admin = require('firebase-admin');
    const { tools, executeTool } = require('../tools/definitions');

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || 'placeholder-key'
    });

    // Ensure admin is initialized (idempotent check)
    if (!admin.apps.length) {
        admin.initializeApp();
    }
    const db = admin.firestore();

    // 1. Get History
    const historySnapshot = await db.collection('messages')
        .where('phone', '==', phone)
        .orderBy('timestamp', 'asc')
        .limitToLast(10)
        .get();

    const messages: any[] = historySnapshot.docs.map((doc: any) => {
        const data = doc.data();
        return {
            role: data.direction === 'inbound' ? 'user' : 'assistant',
            content: data.content
        };
    });

    // Add current message
    messages.push({ role: 'user', content: messageText });

    const systemPrompt = `
    You are Sofía, the helpful and energetic AI receptionist at MegaGym ("La casa del dolor" 📍).
    Current time: ${new Date().toISOString()}.

    **GYM INFORMATION (Source of Truth):**
    - **Address:** Mz I Lt 5 Montenegro, San Juan de Lurigancho.
    - **Hours:** Monday to Saturday: 6:00 AM - 10:00 PM. Feriados: Ask for confirmation.
    - **Payment Methods:** Yape, Plin, Cash, Credit Card (Culqi/Web).

    - **Prices:** (No enrollment fee)
        - **1 Month:** S/ 80.
        - **2 Months:** S/ 120.
        - **3 Months:** S/ 150.
        - **Daily Class:** S/ 6.
    - **Payment:**
        - If user says "Quiero pagar", "Pasame el link", or agrees to a plan: **Call the 'generate_payment_link' tool immediately.**
        - Confirm the plan name and amount before generating.
        - Once generated, show the link and say: "Here is your secure payment link. Once paid, your membership activates automatically! 🚀"
    
    **AEROBICS / GROUP CLASSES:**
    - **Schedule:** Mon-Sat at 8:00 AM and 8:00 PM.
    - **Price:** S/ 80/month (Use 1 Month plan) or S/ 6 per class.
    
    **POLICIES:**
    - **Freezing:** Allowed for travel or health reasons. Coordinate via WhatsApp.
    - **Installments:** Only for 2 and 3-month plans.

    **TONE & PERSONALITY:**
    - **Identify as "Sofía":** You are the friendly, energetic receptionist at MegaGym.
    - **Be Conversational:** DO NOT dump all the information at once. Provide only what is specifically asked.
    - **Ask Follow-up Questions:** After answering, always ask a relevant question to keep the conversation flowing naturally (e.g., "Are you looking to train morning or evening?", "Have you trained with us before?").
    - **Short & Sweet:** WhatsApp messages should be short (1-3 sentences max per bubble).
    - **Emojis:** Use them naturally but sparingly (💪, 😊, 🦍).
    - **Example:** Instead of listing all plans, say: "We have plans for 1, 2, and 3 months! currently appearing with a promo. Which one would you like to know more about?"
    `;

    // 2. Call OpenAI
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            ...messages
        ],
        tools: tools as any,
        tool_choice: 'auto'
    });

    const responseMessage = response.choices[0].message;

    // 3. Handle Tool Calls
    if (responseMessage.tool_calls) {
        const toolMessages: any[] = [...messages, responseMessage];

        for (const toolCall of responseMessage.tool_calls) {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);

            const functionResult = await executeTool(functionName, functionArgs);

            toolMessages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: JSON.stringify(functionResult)
            });
        }

        // Get final response after tool execution
        const secondResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                ...toolMessages
            ]
        });

        return secondResponse.choices[0].message.content;
    }

    return responseMessage.content;
}
