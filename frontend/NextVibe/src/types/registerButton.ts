export interface RegisterButtonProps {
    username: string;
    email: string;
    password: string;
    strength: string;
    privacy: boolean;
    inviteCode: string;
    onFieldError: (field: string, msg: string) => void;
    onApiError: (error: any) => void;
}