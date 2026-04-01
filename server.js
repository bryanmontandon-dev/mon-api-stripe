const express = require('express');
const cors = require('cors');
// Rappel : gardez bien votre clé sécurisée avec process.env
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors({
    origin: ['https://www.bmstudio.ch', 'https://bmstudio.ch','https://www.montandon-watches.ch', 'https://montandon-watches.ch', 'https://www.bormand.ch', 'https://bormand.ch']
}));

app.use(express.json());

app.post('/creer-session-paiement', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],

            // Pré-remplir l'email du client sur la page Stripe
            customer_email: req.body.email || undefined,

            // --- NOUVEAUTÉS POUR LA RÉFÉRENCE ---
            client_reference_id: req.body.reference,

            payment_intent_data: {
                metadata: {
                    'Référence Devis': req.body.reference,
                    'Client': req.body.name || ''
                }
            },
            metadata: {
                'Référence Devis': req.body.reference,
                'Client': req.body.name || ''
            },
            // ------------------------------------

            line_items: [{
                price_data: {
                    currency: 'chf',
                    unit_amount: req.body.amount,
                    product_data: {
                        name: 'Votre Devis Sur-Mesure Bormand',
                        // 3. (Optionnel) Ajoute la réf sous le nom du produit sur la page de paiement
                        description: 'Réf : ' + (req.body.reference || 'Non spécifiée'),
                    },
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'https://www.bormand.ch/succes.html',
            cancel_url: 'https://www.bormand.ch/annulation.html',
        });

        res.json({ url: session.url });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur prêt sur le port ${PORT}`));
