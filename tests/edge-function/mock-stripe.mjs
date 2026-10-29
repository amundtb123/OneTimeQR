// Minimal stand-in for the stripe package: a webhook signature is valid if it equals
// the configured secret, and the event is the JSON body. Checkout sessions are recorded for the tests.
export default class Stripe {
  constructor() {
    this.webhooks = {
      async constructEventAsync(body, signature, secret) {
        if (signature !== secret) throw new Error('No signatures found matching the expected signature');
        return JSON.parse(body);
      },
    };
    this.checkout = {
      sessions: {
        async create(params) {
          globalThis.__lastCheckoutSession = params;
          return { id: 'cs_test', url: 'https://checkout.stripe.test/cs_test' };
        },
      },
    };
  }
}
