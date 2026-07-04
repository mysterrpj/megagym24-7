import * as crypto from 'crypto';

// Firma/verificación de un JWT de identidad (HS256) para el link de voz de Sofía.
// Sin dependencias externas: usa el módulo crypto nativo de Node. Es un token corto que
// solo identifica al miembro (su teléfono) para personalizar la Sofía de voz en agoravoz.
// NO confundir con el token RTC/RTM de Agora, que es otra cosa y no se toca.

function base64url(input: Buffer | string): string {
    return Buffer.from(input)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64urlDecode(input: string): Buffer {
    const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
    return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export interface VoiceTokenPayload {
    phone: string;
    jti?: string;
    iat?: number;
    exp?: number;
    [key: string]: any;
}

// Firma un token con vencimiento (por defecto 15 minutos). Añade iat/exp/jti.
export function signVoiceToken(
    payload: VoiceTokenPayload,
    secret: string,
    expiresInSec = 15 * 60
): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const body: VoiceTokenPayload = {
        jti: crypto.randomUUID(),
        ...payload,
        iat: now,
        exp: now + expiresInSec,
    };
    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(body));
    const data = `${headerB64}.${payloadB64}`;
    const sig = base64url(crypto.createHmac('sha256', secret).update(data).digest());
    return `${data}.${sig}`;
}

export interface VerifyResult {
    valid: boolean;
    payload?: VoiceTokenPayload;
    reason?: 'malformed' | 'bad_signature' | 'bad_payload' | 'expired';
}

// Verifica firma y vencimiento. Comparación de firma en tiempo constante.
export function verifyVoiceToken(token: string, secret: string): VerifyResult {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return { valid: false, reason: 'malformed' };
    const [headerB64, payloadB64, sig] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const expected = base64url(crypto.createHmac('sha256', secret).update(data).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { valid: false, reason: 'bad_signature' };
    }
    let payload: VoiceTokenPayload;
    try {
        payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
    } catch {
        return { valid: false, reason: 'bad_payload' };
    }
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && now > payload.exp) {
        return { valid: false, reason: 'expired' };
    }
    return { valid: true, payload };
}
