// ─────────────────────────────────────────────
//  SPENDNOT — Excel Export
//  lib/export.ts
// ─────────────────────────────────────────────
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { Platform } from 'react-native';
import { Expense, Wallet, Budget } from '../types/models';
import { getCategoryDef } from '../constants/theme';

export async function exportToExcel(
  expenses: Expense[],
  wallets: Wallet[],
  budgets: Budget[],
): Promise<void> {
  const wb = XLSX.utils.book_new();

  // ── Expenses sheet ──
  const expRows = expenses.map((e) => ({
    Date: e.date.toDate().toLocaleDateString('en-IN'),
    Time: e.date.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    Type: e.type,
    Category: getCategoryDef(e.category).label,
    Amount: e.amount,
    Note: e.note ?? '',
    Wallet: e.walletId,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), 'Expenses');

  // ── Wallets sheet ──
  const walletRows = wallets.map((w) => ({
    Name: w.name,
    Type: w.type,
    Balance: w.balance,
    Default: w.isDefault ? 'Yes' : 'No',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(walletRows), 'Wallets');

  // ── Budgets sheet ──
  if (budgets.length > 0) {
    const budgetRows = budgets.map((b) => ({
      Category: getCategoryDef(b.category).label,
      Limit: b.limit,
      Period: b.period,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(budgetRows), 'Budgets');
  }

  const date = new Date().toISOString().slice(0, 10);

  // Web download fallback handler
  if (Platform.OS === 'web') {
    const wbout = XLSX.write(wb, { type: 'binary', bookType: 'xlsx' });
    const s2ab = (s: string) => {
      const buf = new ArrayBuffer(s.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xff;
      return buf;
    };
    const blob = new Blob([s2ab(wbout)], { type: 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spendnot_export_${date}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    return;
  }

  // Native share handler
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const fileUri = `${FileSystem.cacheDirectory}spendnot_export_${date}.xlsx`;

  await FileSystem.writeAsStringAsync(fileUri, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Export SPENDNOT data',
    UTI: 'com.microsoft.excel.xlsx',
  });
}
