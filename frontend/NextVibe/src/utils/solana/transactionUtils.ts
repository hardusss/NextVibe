import { FormattedTransaction } from '@/src/types/solana';

/**
 * Structure for SectionList data
 */
export interface TransactionSection {
    title: string;
    data: FormattedTransaction[];
}

/**
 * Groups transactions by date with smart labeling (Today, Yesterday, Date).
 * * @param transactions - Array of formatted Solana transactions
 * @returns Sections array sorted by date for SectionList
 */
export const groupTransactionsByDate = (transactions: FormattedTransaction[]): TransactionSection[] => {
    if (!transactions || transactions.length === 0) {
        return [];
    }

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (d1: Date, d2: Date) => {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    };

    const grouped = transactions.reduce((acc, transaction) => {
        const date = transaction.time || new Date();
        
        let sectionTitle: string;
        if (isSameDay(date, today)) {
            sectionTitle = 'Today';
        } else if (isSameDay(date, yesterday)) {
            sectionTitle = 'Yesterday';
        } else {
            sectionTitle = date.toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        }

        if (!acc[sectionTitle]) {
            acc[sectionTitle] = [];
        }
        acc[sectionTitle].push(transaction);
        return acc;
    }, {} as { [key: string]: FormattedTransaction[] });

    // Ensure we return an array, technically Object.keys isn't guaranteed order, 
    // but for date groups usually inserted in order it works. 
    // For production, you might want to explicit sort here.
    return Object.keys(grouped).map(title => ({
        title,
        data: grouped[title]
    }));
};