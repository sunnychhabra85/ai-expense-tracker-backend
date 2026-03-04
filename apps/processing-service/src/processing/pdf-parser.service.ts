// =============================================================
// apps/processing-service/src/processing/pdf-parser.service.ts
// Parses raw OCR text into structured Transaction objects
// =============================================================

import { Injectable, Logger } from '@nestjs/common';

export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  rawText: string;
}

@Injectable()
export class PdfParserService {
  private readonly logger = new Logger(PdfParserService.name);

  // Common date patterns in bank statements
  private readonly DATE_PATTERNS = [
    /(\d{2}[-\/]\d{2}[-\/]\d{4})/,    // DD-MM-YYYY or DD/MM/YYYY
    /(\d{4}[-\/]\d{2}[-\/]\d{2})/,    // YYYY-MM-DD
    /(\d{2}\s+\w{3}\s+\d{4})/,        // 01 Jan 2024
    /(\w{3}\s+\d{2},?\s+\d{4})/,      // Jan 01, 2024
  ];

  // ── Main parse entry point ────────────────────────────────────
  // Many bank statements split a single transaction across
  // multiple lines (date, description, amount/balance). We first
  // group related lines into "blocks" by date, then parse each
  // block as a single transaction.
  parse(rawText: string): ParsedTransaction[] {
    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const blocks: string[] = [];
    let currentBlockLines: string[] = [];

    const flushCurrentBlock = () => {
      if (currentBlockLines.length === 0) return;
      const blockText = currentBlockLines.join(' ').trim();
      if (blockText.length > 0) {
        blocks.push(blockText);
      }
      currentBlockLines = [];
    };

    for (const line of lines) {
      // Skip obvious header / summary lines
      if (this.isHeaderLine(line)) {
        this.logger.debug(`Skipped header: ${line.substring(0, 80)}`);
        continue;
      }

      const hasDate = !!this.extractDate(line);

      // A new date usually indicates the start of a new transaction
      if (hasDate && currentBlockLines.length > 0) {
        flushCurrentBlock();
      }

      currentBlockLines.push(line);
    }

    // Flush final block
    flushCurrentBlock();

    const transactions: ParsedTransaction[] = [];
    let skippedBlocks = 0;

    for (const block of blocks) {
      const tx = this.parseLine(block);
      if (tx) {
        transactions.push(tx);
      } else {
        skippedBlocks++;
        this.logger.debug(`Skipped block: ${block.substring(0, 120)}`);
      }
    }

    this.logger.log(
      `Parsed ${transactions.length} transactions from ${blocks.length} blocks (${skippedBlocks} skipped)`
    );
    return transactions;
  }

  // ── Try to parse a single line as a transaction ───────────────
  private parseLine(line: string): ParsedTransaction | null {
    // Skip header lines
    if (this.isHeaderLine(line)) {
      this.logger.debug(`Skipped header: ${line.substring(0, 60)}`);
      return null;
    }

    // Skip balance entries (Opening/Closing Balance)
    if (this.isBalanceEntry(line)) {
      this.logger.debug(`Skipped balance entry: ${line.substring(0, 60)}`);
      return null;
    }

    // Skip non-transaction entries (interest, charges that shouldn't be expenses)
    if (this.isNonExpenseTransaction(line)) {
      this.logger.debug(`Skipped non-expense: ${line.substring(0, 60)}`);
      return null;
    }

    // Must contain a date to be a transaction
    const date = this.extractDate(line);
    if (!date) {
      this.logger.debug(`No date found: ${line.substring(0, 60)}`);
      return null;
    }

    // Extract all amounts from the block. We pass the raw date
    // string so amount parsing can ignore numbers that belong
    // to the date (e.g. "05-01-2026" → 05, 01, 2026).
    const amounts = this.extractAllAmounts(line, date.raw);
    if (amounts.length === 0) return null;

    // Identify transaction amount and type (Debit/Credit)
    const result = this.identifyTransactionAmount(line, amounts);
    if (!result) return null;

    const { amount, type } = result;

    // Extract description (text between date and amounts)
    const description = this.extractDescription(line, date.raw, amounts);
    
    this.logger.log(
      `✓ Parsed: Date=${date.raw}, Amount=${amount}, Type=${type}, Desc="${description.substring(0, 40)}..."`
    );

    return {
      date,
      description: description || line.substring(0, 80),
      amount,
      type,
      rawText: line,
    };
  }

  private isHeaderLine(line: string): boolean {
    const lower = line.toLowerCase();
    
    // Header lines typically contain multiple column names together
    const headerPatterns = [
      /^tran\s+date/i,
      /^date.*particulars.*debit.*credit/i,
      /^chq\s+no.*particulars/i,
      /particulars.*debit.*credit.*balance/i,
      /^total/i,
      /^statement/i,
      /^account.*summary/i,
      /^page\s+\d+/i,
      /^branch/i,
      /^customer/i,
    ];
    
    return headerPatterns.some(pattern => pattern.test(line));
  }

  // Check if line is a balance entry (Opening/Closing Balance, B/F, C/F)
  private isBalanceEntry(line: string): boolean {
    const lower = line.toLowerCase();
    
    // Balance-related patterns that can appear anywhere in the line
    const balancePatterns = [
      /opening\s+balance/i,
      /closing\s+balance/i,
      /balance\s+b\/f/i,      // Balance Brought Forward
      /balance\s+c\/f/i,      // Balance Carried Forward
      /b\/f\s+balance/i,
      /c\/f\s+balance/i,
      /^balance\s*:/i,
      /^\s*balance\s*$/i,
      /total\s+balance/i,
    ];
    
    return balancePatterns.some(pattern => pattern.test(line));
  }
  // Check if line represents a non-expense transaction
  private isNonExpenseTransaction(line: string): boolean {
    const lower = line.toLowerCase();
    
    // Skip internal transfers and non-expense debits
    const nonExpensePatterns = [
      /to\\s+transfer/i,           // Account-to-account transfer
      /by\\s+transfer/i,
      /self\\s+transfer/i,
      /own\\s+account/i,
      /reversal/i,                 // Reversals (usually credits anyway)
      /interest\\s+paid/i,         // Interest is income, not expense
      /interest\\s+credited/i,
      /dividend/i,
      /maturity/i,
    ];
    
    return nonExpensePatterns.some(pattern => pattern.test(line));
  }
  private extractAllAmounts(
    text: string,
    dateStr?: string,
  ): Array<{ value: number; text: string; index: number }> {
    // Match all numbers with optional commas and decimals (flexible: 1000, 1000.0, 1000.00)
    const amountRegex = /(?:Rs\.?|INR|₹|\$)?\s*([\d,]+(?:\.\d{1,2})?)\b/gi;
    const amounts: Array<{ value: number; text: string; index: number }> = [];

    // If we know the raw date string for this block, compute its
    // range so we can ignore numeric tokens that belong to the date
    // itself (e.g. 05, 01, 2026 in "05-01-2026").
    let dateStart = -1;
    let dateEnd = -1;
    if (dateStr) {
      dateStart = text.indexOf(dateStr);
      if (dateStart !== -1) {
        dateEnd = dateStart + dateStr.length;
      }
    }

    let match: RegExpExecArray | null;
    while ((match = amountRegex.exec(text)) !== null) {
      // Skip any numeric token that lies inside the date substring
      if (dateStart !== -1 && dateEnd !== -1) {
        if (match.index >= dateStart && match.index < dateEnd) {
          continue;
        }
      }

      const numberText = match[1];
      const value = parseFloat(numberText.replace(/,/g, ''));

      // Valid amounts should be reasonable transaction values (0.01 to 100M)
      if (!isNaN(value) && value >= 0.01 && value < 100000000) {
        amounts.push({
          value,
          text: match[0],
          index: match.index,
        });
      }
    }

    if (amounts.length === 0) {
      this.logger.debug(`No amounts found in block: ${text.substring(0, 80)}`);
    }

    return amounts;
  }

  private identifyTransactionAmount(
    line: string, 
    amounts: Array<{ value: number; text: string; index: number }>
  ): { amount: number; type: 'DEBIT' | 'CREDIT' } | null {
    if (amounts.length === 0) return null;

    // Bank statements typically have: Date | Description | Debit | Credit | Balance
    // The transaction amount is either in Debit or Credit column
    // Balance is usually the last amount on the line

    let transactionAmount: number = amounts[0].value;
    let type: 'DEBIT' | 'CREDIT' = this.detectTypeByKeywords(line);

    if (amounts.length === 1) {
      // Only one amount - could be debit or credit
      transactionAmount = amounts[0].value;
      type = this.detectTypeByKeywords(line);
    } else if (amounts.length === 2) {
      // Two amounts: likely transaction amount + balance
      // First amount is transaction, second is balance
      transactionAmount = amounts[0].value;
      type = this.detectTypeByKeywords(line);
    } else if (amounts.length >= 3) {
      // Three or more amounts: likely Debit | Credit | Balance
      // If line has explicit debit/credit indicators, use them
      
      if (this.hasDebitIndicator(line)) {
        // Use the first reasonable amount as debit
        transactionAmount = amounts[0].value;
        type = 'DEBIT';
      } else if (this.hasCreditIndicator(line)) {
        // Use the first reasonable amount as credit
        transactionAmount = amounts[0].value;
        type = 'CREDIT';
      } else {
        // No clear indicator - use first amount and detect type
        transactionAmount = amounts[0].value;
        type = this.detectTypeByKeywords(line);
      }
    }

    return { amount: transactionAmount, type };
  }

  private hasDebitIndicator(line: string): boolean {
    const lower = line.toLowerCase();
    return lower.includes('dr') || 
           lower.includes('debit') || 
           lower.includes('withdrawal') ||
           lower.includes('payment') ||
           lower.includes('ach-dr') ||
           lower.includes('upi/p2m') ||
           lower.includes('upi-') ||
           lower.includes('imps-') ||
           lower.includes('neft-') ||
           lower.includes('pos') ||
           lower.includes('purchase') ||
           lower.includes('billpay');
  }

  private hasCreditIndicator(line: string): boolean {
    const lower = line.toLowerCase();
    return lower.includes('cr') ||
           lower.includes('credit') ||
           lower.includes('received') ||
           lower.includes('refund') ||
           lower.includes('cashback') ||
           lower.includes('deposit') ||
           lower.includes('salary') ||
           lower.includes('dividend') ||
           lower.includes('interest') ||
           lower.includes('ach-cr');
  }

  private detectTypeByKeywords(line: string): 'DEBIT' | 'CREDIT' {
    return this.hasCreditIndicator(line) ? 'CREDIT' : 'DEBIT';
  }

  private extractDate(line: string): (Date & { raw: string }) | null {
    for (const pattern of this.DATE_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const raw = match[1];
        const parsed = new Date(raw.replace(/(\d{2})[-\/](\d{2})[-\/](\d{4})/, '$3-$2-$1'));
        if (!isNaN(parsed.getTime())) {
          (parsed as any).raw = raw;
          return parsed as Date & { raw: string };
        }
      }
    }
    return null;
  }

  private extractDescription(
    line: string, 
    dateStr: string, 
    amounts: Array<{ value: number; text: string; index: number }>
  ): string {
    let desc = line.replace(dateStr, '');

    // Remove all amount strings from description
    for (const amt of amounts) {
      desc = desc.replace(amt.text, '');
    }

    // Clean up
    desc = desc
      .replace(/\s+(CR|DR|CREDIT|DEBIT)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return desc.substring(0, 200);
  }
}

