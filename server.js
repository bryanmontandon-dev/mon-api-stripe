const express = require('express');
const cors = require('cors');
// Rappel : gardez bien votre clé sécurisée avec process.env
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); 

const app = express();

app.use(cors({
    origin: ['https://www.bmstudio.ch', 'https://bmstudio.ch','https://www.montandon-watches.ch', 'https://montandon-watches.ch']
}));

app.use(express.json());

app.post('/creer-session-paiement', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            
            // --- NOUVEAUTÉS POUR LA RÉFÉRENCE ---
            // 1. Lie la transaction à votre ID interne
            client_reference_id: req.body.reference, 
            
            // 2. Affiche la référence dans les détails du paiement sur Stripe
            payment_intent_data: {
                metadata: {
                    'Référence Devis': req.body.reference
                }
            },
            // Affiche la référence sur la session globale
            metadata: {
                'Référence Devis': req.body.reference
            },
            // ------------------------------------

            line_items: [{
                price_data: {
                    currency: 'chf',
                    unit_amount: req.body.amount,
                    product_data: {
                        name: 'Votre Devis Sur-Mesure Montandon',
                        // 3. (Optionnel) Ajoute la réf sous le nom du produit sur la page de paiement
                        description: 'Réf : ' + (req.body.reference || 'Non spécifiée'),
                    },
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'https://www.bmstudio.ch/succes.html',
            cancel_url: 'https://www.bmstudio.ch/annulation.html',
        });
        
        res.json({ url: session.url });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur prêt sur le port ${PORT}`));
