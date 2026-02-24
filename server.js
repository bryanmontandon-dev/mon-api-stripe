const express = require('express');
const cors = require('cors');
// Mettez votre vraie clé SECRÈTE Stripe ci-dessous
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// 1. Autoriser UNIQUEMENT votre site Infomaniak (règle le problème de CORS)
app.use(cors({
    origin: ['https://www.bmstudio.ch', 'https://bmstudio.ch']
}));

// 2. Permettre de lire les données envoyées par votre site
app.use(express.json());

// 3. La création de la session Stripe
app.post('/creer-session-paiement', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'chf',
                    unit_amount: req.body.amount, // Le prix envoyé par votre pop-up
                    product_data: {
                        name: 'Votre Devis Sur-Mesure Montandon',
                    },
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'https://www.bmstudio.ch/succes.html',
            cancel_url: 'https://www.bmstudio.ch/annulation.html',
        });
        
        // On renvoie le lien à votre site
        res.json({ url: session.url });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Allumer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur prêt sur le port ${PORT}`));
