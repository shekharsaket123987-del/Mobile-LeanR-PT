/**
 * Admin Sales — New PRD.md §4.C "Screen: Sales" — transaction list from
 * `sales_view` (confirmed live: subscription_id, client_id, client_code,
 * client_name, package_name, amount, sale_date). Search (client/plan),
 * header shows filtered total ₹.
 */
import { supabase } from '@/lib/supabase/client';

export type SaleRow = {
  subscriptionId: string;
  clientId: string;
  clientCode: string;
  clientName: string;
  packageName: string;
  amount: number;
  saleDate: string;
};

export async function listSales(): Promise<SaleRow[]> {
  // Web's listSalesAction() has no limit; mirror that as closely as a mobile
  // list view reasonably can with a generous cap instead of true pagination.
  const { data, error } = await supabase.from('sales_view').select('*').order('sale_date', { ascending: false }).limit(2000);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    subscriptionId: row.subscription_id,
    clientId: row.client_id,
    clientCode: row.client_code,
    clientName: row.client_name,
    packageName: row.package_name,
    amount: Number(row.amount),
    saleDate: row.sale_date,
  }));
}
