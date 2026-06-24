const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// --- CORS : origines autorisees ---
app.use(cors({
    origin: ['https://www.bormand.ch', 'https://bormand.ch']
}));

app.use(express.json());

// --- Rate limiting : max 10 requetes/min par IP ---
const paymentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Trop de requetes. Veuillez patienter.' }
});

// --- Montant minimum (en centimes CHF) ---
const MIN_AMOUNT = 1000; // 10 CHF minimum
const MAX_AMOUNT = 10000000; // 100'000 CHF maximum

app.post('/creer-session-paiement', paymentLimiter, async (req, res) => {
    try {
        const { amount, reference, email, name } = req.body;

        // --- Validation des entrees ---
        if (!Number.isInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
            return res.status(400).json({ error: 'Montant invalide.' });
        }
        if (!reference || typeof reference !== 'string' || reference.length > 100) {
            return res.status(400).json({ error: 'Reference invalide.' });
        }
        if (email && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
            return res.status(400).json({ error: 'Email invalide.' });
        }
        if (name && (typeof name !== 'string' || name.length > 200)) {
            return res.status(400).json({ error: 'Nom invalide.' });
        }

        const sanitizedRef = reference.replace(/[<>"'&\\]/g, '').substring(0, 100);
        const sanitizedName = name ? name.replace(/[<>"'&\\]/g, '').substring(0, 200) : '';

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: email || undefined,
            client_reference_id: sanitizedRef,

            payment_intent_data: {
                metadata: {
                    'Reference_Devis': sanitizedRef,
                    'Client': sanitizedName
                }
            },
            metadata: {
                'Reference_Devis': sanitizedRef,
                'Client': sanitizedName
            },

            line_items: [{
                price_data: {
                    currency: 'chf',
                    unit_amount: amount,
                    product_data: {
                        name: 'Votre Devis Sur-Mesure Bormand',
                        description: 'Ref : ' + sanitizedRef,
                    },
                },
                quantity: 1,
            }],
            mode: 'payment',
            // PII retire de l'URL — email/nom passes via sessionStorage cote client
            success_url: 'https://www.bormand.ch/succes.html?ref=' + encodeURIComponent(sanitizedRef) + '&amount=' + amount,
            cancel_url: 'https://www.bormand.ch/annulation.html?ref=' + encodeURIComponent(sanitizedRef),
        });

        res.json({ url: session.url });

    } catch (error) {
        // Ne pas exposer les details internes au client
        console.error('Erreur Stripe:', error.message);
        res.status(500).json({ error: 'Erreur lors de la creation de la session de paiement.' });
    }
});

// --- VERIFICATION RECAPTCHA ENTERPRISE (score anti-robot, connexion/inscription client) ---
const RECAPTCHA_PROJECT_ID = 'watches-2e49f'; // meme projet que Firebase
const RECAPTCHA_SITE_KEY = '6Lc6mDAtAAAAAD2DJ-m2O_zH-MjTQcdzQsQoF0Ma';
const RECAPTCHA_API_KEY = process.env.RECAPTCHA_API_KEY; // a definir sur Render

const recaptchaLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Trop de requetes. Veuillez patienter.' }
});

app.post('/verifier-recaptcha', recaptchaLimiter, async (req, res) => {
    try {
        const { token, action } = req.body;
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ valid: false, error: 'Token manquant.' });
        }
        if (!RECAPTCHA_API_KEY) {
            // Cle pas encore configuree sur Render : on ne bloque pas un vrai client
            return res.json({ valid: true, score: null, note: 'recaptcha non configure' });
        }

        const response = await fetch(
            `https://recaptchaenterprise.googleapis.com/v1/projects/${RECAPTCHA_PROJECT_ID}/assessments?key=${RECAPTCHA_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: { token, siteKey: RECAPTCHA_SITE_KEY, expectedAction: action || undefined }
                })
            }
        );
        const data = await response.json();

        if (!data.tokenProperties || !data.tokenProperties.valid) {
            return res.json({ valid: false, reason: (data.tokenProperties && data.tokenProperties.invalidReason) || 'invalide' });
        }

        res.json({ valid: true, score: data.riskAnalysis ? data.riskAnalysis.score : null });
    } catch (error) {
        console.error('Erreur reCAPTCHA:', error.message);
        // Fail-open : une erreur reseau ne doit jamais bloquer un vrai client
        res.json({ valid: true, score: null, note: 'erreur verification' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Serveur pret sur le port ' + PORT));
