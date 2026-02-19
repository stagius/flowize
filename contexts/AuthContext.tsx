import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { encrypt, decrypt, isEncrypted } from '../utils/crypto';

type LoginMode = 'oauth' | 'manual';

interface AuthContextType {
    isAuthenticated: boolean;
    token: string | null;
    loginMode: LoginMode;
    login: (token: string, mode?: LoginMode) => Promise<void>;
    logout: () => void;
    setLoginMode: (mode: LoginMode) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'flowize.auth.token.v1';
const LOGIN_MODE_STORAGE_KEY = 'flowize.auth.mode.v1';

interface AuthProviderProps {
    children: ReactNode;
    initialToken?: string;
    onLoginSuccess?: (token: string) => void;
    onLogout?: () => void;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ 
    children, 
    initialToken = '',
    onLoginSuccess,
    onLogout
}) => {
    const [token, setToken] = useState<string | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [loginMode, setLoginModeState] = useState<LoginMode>(() => {
        // Load saved login mode preference
        if (typeof window === 'undefined') return 'oauth';
        try {
            const saved = window.localStorage.getItem(LOGIN_MODE_STORAGE_KEY);
            return (saved === 'manual' || saved === 'oauth') ? saved : 'oauth';
        } catch {
            return 'oauth';
        }
    });
    const [isInitialized, setIsInitialized] = useState(false);

    // Initialize token from storage on mount
    useEffect(() => {
        const initializeAuth = async () => {
            if (initialToken) {
                // Use initial token if provided (from settings)
                setToken(initialToken);
                setIsAuthenticated(true);
                setIsInitialized(true);
                return;
            }

            // Try to load encrypted token from storage
            if (typeof window === 'undefined') {
                setIsInitialized(true);
                return;
            }

            try {
                const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
                if (storedToken) {
                    // Check if it's encrypted
                    if (isEncrypted(storedToken)) {
                        try {
                            const decryptedToken = await decrypt(storedToken);
                            setToken(decryptedToken);
                            setIsAuthenticated(true);
                        } catch (error) {
                            console.error('Failed to decrypt stored token:', error);
                            // Clear invalid encrypted token
                            window.localStorage.removeItem(TOKEN_STORAGE_KEY);
                        }
                    } else {
                        // Plain token (legacy support)
                        setToken(storedToken);
                        setIsAuthenticated(true);
                    }
                }
            } catch (error) {
                console.error('Failed to load token from storage:', error);
            }

            setIsInitialized(true);
        };

        initializeAuth();
    }, [initialToken]);

    useEffect(() => {
        setIsAuthenticated(Boolean(token));
    }, [token]);

    const login = async (newToken: string, mode: LoginMode = 'oauth') => {
        setToken(newToken);
        setIsAuthenticated(true);
        
        // Encrypt and store token
        if (typeof window !== 'undefined') {
            try {
                const encryptedToken = await encrypt(newToken);
                window.localStorage.setItem(TOKEN_STORAGE_KEY, encryptedToken);
            } catch (error) {
                console.error('Failed to encrypt token, storing in plain text:', error);
                // Fallback to plain storage if encryption fails
                window.localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
            }
        }

        // Save login mode preference
        setLoginModeState(mode);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(LOGIN_MODE_STORAGE_KEY, mode);
        }

        onLoginSuccess?.(newToken);
    };

    const logout = () => {
        setToken(null);
        setIsAuthenticated(false);
        
        // Clear stored token and login mode
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(TOKEN_STORAGE_KEY);
            window.localStorage.removeItem(LOGIN_MODE_STORAGE_KEY);
        }
        
        onLogout?.();
    };

    const setLoginMode = (mode: LoginMode) => {
        setLoginModeState(mode);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(LOGIN_MODE_STORAGE_KEY, mode);
        }
    };

    // Don't render children until auth is initialized
    if (!isInitialized) {
        return null;
    }

    return (
        <AuthContext.Provider value={{ isAuthenticated, token, loginMode, login, logout, setLoginMode }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
