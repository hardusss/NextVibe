import { useState } from "react";

/**
 * Custom hook for managing transaction form state and validation.
 * @param balance - Current token balance for validation and 'Max' functionality
 */
export function useTransactionForm() {
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');

    /** Sets the amount to the maximum available balance */
    const handleMax = (currentBalance: number) => setAmount(String(currentBalance));
    
    /**
     * Validates form inputs.
     * @returns Error message string or null if valid
     */
    const validate = (currentBalance: number) => {
        if (!recipient) return "Please enter recipient address";
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return "Please enter valid amount";
        if (Number(amount) > currentBalance) return "Insufficient balance";
        return null; // No error
    }

    /** Resets form fields to initial state */
    const resetForm = () => {
        setRecipient('');
        setAmount('');
    };

    return { 
        recipient, 
        setRecipient, 
        amount, 
        setAmount, 
        handleMax, 
        validate, 
        resetForm 
    };
}