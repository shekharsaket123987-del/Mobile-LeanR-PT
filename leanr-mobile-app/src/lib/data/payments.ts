/**
 * Razorpay purchase flow — LEANR_PT_MOBILE_PRD.md §8g. Client half of the
 * `razorpay` Edge Function deployed on 2026-08-19 (create-order/
 * verify-payment — see that function's source, callable via
 * `supabase.functions.invoke`, for exactly what it does and the secrets
 * it needs before it actually works).
 *
 * Uses the official `react-native-razorpay` checkout SDK — a native
 * module. Like `expo-image-picker`, this needs `npx expo prebuild` +
 * a dev build; it will not work in Expo Go.
 */
import RazorpayCheckout from 'react-native-razorpay';

import { extractFunctionErrorMessage } from '@/lib/data/edge-functions';
import { supabase } from '@/lib/supabase/client';

export type PurchaseResult = { subscriptionId: string };

export async function purchasePackage(
  packageId: string,
  packageName: string,
  prefill: { email?: string; contact?: string; name?: string }
): Promise<PurchaseResult> {
  const { data: orderData, error: orderError } = await supabase.functions.invoke('razorpay', {
    body: { action: 'create-order', packageId },
  });
  if (orderError) throw new Error(await extractFunctionErrorMessage(orderError, 'Could not start checkout.'));

  let checkoutResult;
  try {
    checkoutResult = await RazorpayCheckout.open({
      key: orderData.keyId,
      amount: String(orderData.amountPaise),
      currency: orderData.currency,
      name: 'LEANR by Fitelo',
      description: packageName,
      order_id: orderData.orderId,
      prefill,
      theme: { color: '#F5E400' },
    });
  } catch (err) {
    const razorpayError = err as { code?: number; description?: string };
    throw new Error(razorpayError.description || 'Payment was not completed.');
  }

  const { data: verifyData, error: verifyError } = await supabase.functions.invoke('razorpay', {
    body: {
      action: 'verify-payment',
      razorpay_order_id: checkoutResult.razorpay_order_id,
      razorpay_payment_id: checkoutResult.razorpay_payment_id,
      razorpay_signature: checkoutResult.razorpay_signature,
    },
  });
  if (verifyError) {
    throw new Error(
      await extractFunctionErrorMessage(verifyError, 'Payment succeeded but could not be verified — contact support.')
    );
  }

  return { subscriptionId: verifyData.subscriptionId };
}
