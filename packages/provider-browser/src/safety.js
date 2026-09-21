/**
 * Browser Safety Controls: SSRF prevention, private network isolation,
 * and irreversible action protection.
 */
import { SSRFBlockedError } from '@agentctl/core';
export class BrowserSafety {
    static PRIVATE_IP_PATTERNS = [
        /^localhost$/i,
        /^127\.\d+\.\d+\.\d+$/,
        /^10\.\d+\.\d+\.\d+$/,
        /^192\.168\.\d+\.\d+$/,
        /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/,
        /^169\.254\.\d+\.\d+$/, // Link-local and AWS/GCP metadata service
        /^::1$/,
        /^fe80:/i,
        /^fc00:/i
    ];
    /**
     * Validates target URL against SSRF and origin policy rules.
     */
    static validateUrl(targetUrl, allowedOrigins, allowPrivateNetworks = false) {
        let parsed;
        try {
            parsed = new URL(targetUrl);
        }
        catch {
            throw new SSRFBlockedError(targetUrl, 'Invalid URL format');
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new SSRFBlockedError(targetUrl, `Disallowed protocol: ${parsed.protocol}`);
        }
        const hostname = parsed.hostname;
        // 1. SSRF & Private Network checks
        if (!allowPrivateNetworks) {
            for (const pattern of this.PRIVATE_IP_PATTERNS) {
                if (pattern.test(hostname)) {
                    throw new SSRFBlockedError(targetUrl, `Access to loopback or private network (${hostname}) is prohibited.`);
                }
            }
            // Explicit metadata check
            if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
                throw new SSRFBlockedError(targetUrl, 'Access to cloud metadata service is prohibited.');
            }
        }
        // 2. Origin Allowlists
        if (allowedOrigins && allowedOrigins.length > 0) {
            const origin = parsed.origin;
            const isAllowed = allowedOrigins.some((allowed) => {
                if (allowed === origin)
                    return true;
                if (allowed.startsWith('*.')) {
                    const suffix = allowed.slice(2);
                    return hostname.endsWith(suffix);
                }
                return false;
            });
            if (!isAllowed) {
                throw new SSRFBlockedError(targetUrl, `Origin '${origin}' is not in configured allowedOrigins: ${allowedOrigins.join(', ')}`);
            }
        }
    }
    /**
     * Checks if an action on a target element is potentially irreversible or high-risk.
     */
    static isIrreversible(operation, element) {
        if (!element)
            return false;
        const label = (element.label || '').toLowerCase();
        const type = (element.type || '').toLowerCase();
        // High risk keywords
        const destructiveKeywords = [
            'delete',
            'destroy',
            'remove account',
            'drop',
            'buy now',
            'place order',
            'confirm payment',
            'pay',
            'transfer money',
            'checkout',
            'submit order'
        ];
        if (destructiveKeywords.some((kw) => label.includes(kw))) {
            return true;
        }
        // Form submit button on sensitive forms
        if (operation === 'click' && type === 'submit' && destructiveKeywords.some((kw) => label.includes(kw))) {
            return true;
        }
        return false;
    }
}
//# sourceMappingURL=safety.js.map