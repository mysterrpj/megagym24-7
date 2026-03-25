/**
 * Transcribes audio from a URL (Twilio media) using OpenAI Whisper.
 * @param mediaUrl The URL of the audio file.
 * @param accountSid Twilio Account SID for authentication.
 * @param authToken Twilio Auth Token for authentication.
 */
export async function transcribeAudio(mediaUrl: string, accountSid: string, authToken: string): Promise<string> {
    const axios = require('axios');
    const OpenAI = require('openai');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || ''
    });
    try {
        console.log(`Starting transcription for: ${mediaUrl}`);

        // 1. Download the audio file
        const response = await axios({
            method: 'get',
            url: mediaUrl,
            responseType: 'arraybuffer',
            auth: {
                username: accountSid,
                password: authToken
            }
        });

        const buffer = Buffer.from(response.data);

        // 2. Save to a temporary file (Whisper API needs a file with extension in some client versions, or a named stream)
        const tempFilePath = path.join(os.tmpdir(), `voice_${Date.now()}.ogg`);
        fs.writeFileSync(tempFilePath, buffer);

        // 3. Send to OpenAI Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-1",
            language: "es" // Optional: force Spanish for better accuracy in this context
        });

        // 4. Clean up
        fs.unlinkSync(tempFilePath);

        console.log(`Transcription successful: ${transcription.text}`);
        return transcription.text;
    } catch (error: any) {
        console.error("Error in transcribeAudio:", error.response?.data || error.message);
        throw new Error("No se pudo transcribir el audio.");
    }
}
