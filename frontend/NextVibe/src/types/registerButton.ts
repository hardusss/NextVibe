export interface RegisterButtonProps {
    username: string;
    email: string;
    password: string;
    strength: string;
    privacy: boolean;
    inviteCode: string;
    onFieldError: (field: string, msg: string) => void;
    onApiError: (error: any) => void;
    /** The email has to be confirmed with the code sent to it. */
    onVerificationRequired?: (info: import('../api/emailCodes').CodeRequired) => void;
}