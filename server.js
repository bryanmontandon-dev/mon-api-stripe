const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// --- Firebase Admin pour mettre à jour les commandes ---
const admin = require('firebase-admin');
admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
});
const db = admin.firestore();
const appId = 'montandon-watches-prod';

function getCollectionRef(collectionName) {
    return db.collection('artifacts').doc(appId)
        .collection('public').doc('data')
        .collection(collectionName);
}
// -------------------------------------------------------

const app = express();

app.use(cors({
    origin: ['https://www.bmstudio.ch', 'https://bmstudio.ch', 'https://www.montandon-watches.ch', 'https://montandon-watches.ch', 'https://www.bormand.ch', 'https://bormand.ch']
}));

// IMPORTANT : le webhook Stripe doit recevoir le body RAW (avant express.json)
app.post('/webhook-stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], endpointSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send('Webhook Error: ' + err.message);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const reference = session.client_reference_id || (session.metadata && session.metadata['Référence Devis']);

        if (reference) {
            try {
                const snap = await getCollectionRef('quote_requests').where('reference', '==', reference).get();
                snap.forEach(doc => {
                    doc.ref.update({
                        status: 'paid',
                        paidAt: new Date().toISOString(),
                        stripeSessionId: session.id,
                        stripePaymentIntent: session.payment_intent
                    });
                });
                console.log('Commande ' + reference + ' marquée comme payée');
            } catch (err) {
                console.error('Erreur mise à jour Firestore:', err);
            }
        }
    }

    res.json({ received: true });
});

// Le reste des routes utilise express.json()
app.use(express.json());

app.post('/creer-session-paiement', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            client_reference_id: req.body.reference,
            payment_intent_data: {
                metadata: {
                    'Référence Devis': req.body.reference
                }
            },
            metadata: {
                'Référence Devis': req.body.reference
            },
            line_items: [{
                price_data: {
                    currency: 'chf',
                    unit_amount: req.body.amount,
                    product_data: {
                        name: 'Votre Devis Sur-Mesure Bormand',
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
app.listen(PORT, () => console.log('Serveur prêt sur le port ' + PORT));
