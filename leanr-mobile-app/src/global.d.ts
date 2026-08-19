declare module '*.css';
declare module 'aes-js';

/**
 * `react-native-razorpay` ships no package-level types (only inside its
 * sample app) — this is the minimal shape `src/lib/data/payments.ts`
 * actually uses, from the package's own README example.
 */
declare module 'react-native-razorpay' {
  export type RazorpayCheckoutOptions = {
    key: string;
    amount: string;
    currency: string;
    name: string;
    description?: string;
    order_id: string;
    prefill?: { email?: string; contact?: string; name?: string };
    theme?: { color?: string };
  };
  export type RazorpayCheckoutSuccess = {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  };
  export type RazorpayCheckoutError = { code: number; description: string };

  const RazorpayCheckout: {
    open: (options: RazorpayCheckoutOptions) => Promise<RazorpayCheckoutSuccess>;
  };
  export default RazorpayCheckout;
}
