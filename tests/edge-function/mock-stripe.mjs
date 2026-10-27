// Minimal stand-in for the stripe package: a webhook signature is valid if it equals
// the configured secret, and the event is the JSON body. Covers only what the webhook uses.
export default class Stripe {
  constructor() {
    this.webhooks = {
      async constructEventAsync(body, signature, secret) {
        if (signature !== secret) throw new Error('No signatures found matching the expected signature');
        return JSON.parse(body);
      },
    };
  }
}
