import React, { createContext, useContext, useState, ReactNode } from 'react';
import MessagePopup from './MessagePopup';

type PopupType = 'success' | 'error' | 'info';

interface PopupContextType {
    showPopup: (type: PopupType, title: string, message: string) => void;
}

const PopupContext = createContext<PopupContextType | undefined>(undefined);

export const usePopup = () => {
    const context = useContext(PopupContext);
    if (!context) {
        throw new Error('usePopup must be used within a PopupProvider');
    }
    return context;
};

interface PopupProviderProps {
    children: ReactNode;
}

export const PopupProvider = ({ children }: PopupProviderProps) => {
    const [isVisible, setIsVisible] = useState(false);
    const [popupType, setPopupType] = useState<PopupType>('info');
    const [popupTitle, setPopupTitle] = useState('');
    const [popupMessage, setPopupMessage] = useState('');

    const showPopup = (type: PopupType, title: string, message: string) => {
        setPopupType(type);
        setPopupTitle(title);
        setPopupMessage(message);
        setIsVisible(true);
    };

    const handleClose = () => {
        setIsVisible(false);
    };

    return (
        <PopupContext.Provider value={{ showPopup }}>
            {children}
            <MessagePopup
                isVisible={isVisible}
                onClose={handleClose}
                type={popupType}
                title={popupTitle}
                message={popupMessage}
            />
        </PopupContext.Provider>
    );
};