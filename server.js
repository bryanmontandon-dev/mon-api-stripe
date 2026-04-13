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
const MIN_AMOUNT = 10000; // 100 CHF minimum
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Serveur pret sur le port ' + PORT));
